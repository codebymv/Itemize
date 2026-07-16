# Audience segments GraphQL cutover contract

**Status:** Phase 0 characterization

**Evidence date:** 2026-07-15

## Decision

All nine authenticated segment operations move to `SegmentsModule` GraphQL queries and mutations. Segment preview is a query even though the legacy transport used POST: it is a pure evaluation and persists nothing.

Segments are organization-owned reusable contact predicates. They are also campaign targeting inputs, so one transport-neutral evaluator must serve preview, saved counts, membership pages, campaign preview, and the campaign send snapshot. A consumer must never broaden an unknown or invalid predicate to every contact.

## Target operations

| Legacy behavior | GraphQL operation |
| --- | --- |
| list/detail | `segments`, `segment` |
| create/update/delete | `createSegment`, `updateSegment`, `deleteSegment` |
| recalculate | `recalculateSegment` |
| membership page | `segmentContacts` |
| unsaved preview | `previewSegment` |
| filter vocabulary and tenant references | `segmentFilterOptions` |

Every operation requires the canonical authenticated organization context. Segment, contact, tag, assignee, pipeline-stage, history, and campaign references must remain inside it. Cross-organization IDs fail as validation or non-enumerating not-found results and never become empty or global predicates.

## Definition model

A segment is exactly one of:

- `DYNAMIC`: 1-25 validated filters combined by `AND` or `OR`;
- `STATIC`: 0-5,000 unique contact IDs and no filters.

The input must be a discriminated union, not a bag where static IDs and dynamic filters can coexist. Metadata requires a trimmed 1-255 character name, optional description up to 5,000 characters, six-digit hex color, bounded icon identifier, and explicit active state. Omitted fields on update preserve stored values; explicit nullable fields follow the shared nullability contract.

The supported dynamic vocabulary is frozen by the legacy `segmentFilterOptions` result and covers status, source, email, phone, tags, creation date, activity, email engagement, unsubscribe state, assignee, custom field, deal stage, and booking. Each field has an exact operator set and typed value. Contact statuses are `active`, `inactive`, and `archived`; former UI values such as `lead` and `customer` are invalid.

Unknown fields, operators, statuses, malformed dates, inverted ranges, duplicate or foreign IDs, negative/unbounded day windows, and empty dynamic definitions return `BAD_USER_INPUT`. There is no ignore-unknown compatibility behavior. Day windows are bounded to 1-3,650 days. Reference validation includes static contacts, tag IDs, assigned organization members, and pipeline stages.

## Evaluator and SQL safety

The evaluator returns a SQL condition plus bound parameters. Contact values, arrays, date windows, JSON custom-field keys, and interval counts are parameters; none are interpolated as SQL. The table alias is selected only by trusted server code. Every subquery that can cross contacts—tags, activities, campaign recipients, deals, and bookings—is correlated to the contact and organization.

All consumers use the same normalized definition and evaluator:

```text
definition -> validate tenant references -> compile predicate
                                      -> preview count/sample
                                      -> saved count/history
                                      -> membership page
                                      -> campaign preview/send snapshot
```

Preview count and sample use the identical parameter set. Membership results order by `created_at DESC, id DESC`; the target uses the shared strict page contract and a maximum page size of 100. The preview sample is bounded to five contacts with the same stable ordering.

The legacy segment list is unbounded and the page performs search locally. The GraphQL target must expose a bounded connection and move search/active filtering to the server without changing the deterministic ordering contract.

## Writes, counts, and history

Create validates the complete definition, inserts it, calculates the initial count, updates the cache, and appends initial history in one transaction. Update locks the segment, validates the merged definition, and recalculates only when targeting changes. Invalid input rolls back metadata and targeting together.

Recalculation locks the organization-owned segment before reading its previous count. The count update and history row are one transaction. Concurrent requests serialize, so the first records the real added/removed delta and the next compares against the committed count rather than duplicating it. Evaluator or database errors propagate; recording zero as a successful calculation is forbidden.

`contactCount` and `lastCalculatedAt` are cached observations, not authorization or a frozen audience. Reads that need membership evaluate the current definition. History is newest first and bounded; the initial target may retain the legacy 30-row projection until cursor pagination is implemented.

## Campaign semantics

A saved-segment campaign stores a nullable `segmentId` foreign key, not only a client-side selection. Create/update validate that the segment is active and belongs to the campaign organization. Changing targeting mode clears irrelevant tag, status, and segment fields. Unsupported legacy `custom` campaign targeting fails closed.

Campaign preview evaluates the current saved definition, then applies deliverability exclusions: a recipient needs a non-empty email and cannot be unsubscribed or bounced. Send locks the campaign, revalidates the saved segment, uses the same evaluator, and snapshots the final recipients in `campaign_recipients`. Later segment or contact changes do not rewrite that send snapshot. Preview is advisory because membership can change before the send transaction.

Duplicating a campaign preserves `segmentId`. Deleting a segment conflicts while any campaign references it, including sent history, and the foreign key prevents orphaning. The target must define archival behavior before allowing deactivation of a segment referenced by a scheduled campaign.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Tenancy | own success; foreign segment/contact/tag/member/stage denial; forged organization context |
| Validation | every field/operator/value shape; unknown rules; empty dynamic/static; size and day bounds |
| SQL safety | hostile custom key/value, arrays, dates, interval values, trusted alias only |
| Boolean logic | AND/OR, null/empty semantics, tag any/all/none, date boundary inclusivity |
| CRUD | initial count/history, partial update preservation, rollback, active/search filters, delete conflict |
| Calculation | zero/nonzero changes, additions/removals, simultaneous recalculate, evaluator failure |
| Membership | stable pages, empty/last page, maximum limit, preview/count/page agreement |
| Campaign | create/update/duplicate persistence, preview/send agreement, deliverability exclusions, snapshot stability, inactive/deleted segment failure |
| Migration | fresh schema, existing campaigns with null `segmentId`, FK/index, rollback/forward compatibility |

## Known consumer gaps

The current React builder is not an executable specification for the complete DSL. It creates dynamic segments only; static creation has no UI. Its loose `SegmentFilter` value union and controls cannot faithfully express status arrays or date ranges, do not collect a custom-field key, select only one tag, render no choices for engagement/booking operators, and incorrectly request values for several value-free deal operators. Preview failures are logged but not surfaced inline. These combinations need typed component and browser coverage before migration.

The segment page historically read `type` while the API returns `segment_type`; its counters and badges now accept the actual field. The campaign API consumer now types and tests `segment_id` on create and audience preview, but the campaign creation wizard does not preview an unsaved campaign audience. GraphQL consumer work must cover the full create/select/preview/send journey, stale or deactivated segments, validation messages, and delete conflicts.

## Current evidence and exit gate

Fresh PostgreSQL coverage proves route reachability, exact status metadata, bound preview parameters, tenant isolation, hostile custom-field keys, fail-closed rule validation, dynamic and static membership, bounded pagination, partial-update rollback, serialized history deltas, saved campaign persistence, preview/send recipient agreement, duplicate preservation, delete conflict, and cross-tenant campaign rejection. The clean initializer creates 89 tables and 46 migration markers, including the campaign segment foreign key.

This slice is not ready for traffic until the GraphQL schema uses typed discriminated inputs, every filter family above has executable boundary coverage, the consumer gaps above are resolved, resolver/service parity passes against PostgreSQL, the React consumers use the new operations, scheduled-campaign segment deactivation semantics are fixed, and production migration/rollback plus observability are rehearsed.
