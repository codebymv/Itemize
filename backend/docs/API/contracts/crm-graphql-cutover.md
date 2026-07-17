# CRM GraphQL cutover contract

**Status:** Phase 1 contact CRUD implemented and staging-rehearsed; broader CRM characterization continues

**Evidence date:** 2026-07-17

## Decision

Authenticated contact, activity, tag, pipeline, deal, form-definition, and submission-management operations move to GraphQL. Contact CSV transfer and anonymous embedded-form retrieval/submission remain HTTP protocols owned by NestJS.

The CRM domain feeds workflow execution. Mutations commit domain state and a durable event/outbox record together; they never call the automation engine or a provider from a resolver. The event registry and worker boundary are defined by [Workflow execution cutover contract](workflow-execution-graphql-cutover.md).

The authoritative assignments for all 43 operations are in `graphql-operation-overrides.json`.

## Ownership

| Domain | NestJS owner | Target operations |
| --- | --- | --- |
| Contacts and bulk changes | `ContactsModule` | `contacts`, `contact`, `createContact`, `updateContact`, `deleteContact`, `bulkUpdateContacts`, `bulkDeleteContacts` |
| Aggregate profile/content | `ContactProfilesModule` | `contactProfile`, `contactContent` |
| Activities | `ContactActivitiesModule` | `contactActivities`, `addContactActivity` |
| CSV transfer | `ContactTransfersModule` | retained HTTP `exportContactsCsv`, `importContactsCsv` |
| Tags | `TagsModule` | `tags`, `createTag`, `updateTag`, `deleteTag`, `contactTagSuggestions` |
| Pipelines | `PipelinesModule` | `pipelines`, `pipeline`, `createPipeline`, `updatePipeline`, `deletePipeline` |
| Deals | `DealsModule` | `deals`, `deal`, `createDeal`, `updateDeal`, `deleteDeal`, `moveDeal`, `markDealWon`, `markDealLost`, `reopenDeal` |
| Forms | `FormsModule` | `forms`, `form`, `createForm`, `updateForm`, `deleteForm`, `duplicateForm`, `replaceFormFields` |
| Submission management | `FormSubmissionsModule` | `formSubmissions`, `deleteFormSubmission` |
| Public embedded forms | `PublicFormsModule` | retained HTTP `getPublicForm`, `submitPublicForm` |

## Authentication and tenancy

All GraphQL operations use the verified organization context from `tenancy-graphql-context.md`. IDs outside the active organization return `NOT_FOUND`; referenced IDs supplied to an owned mutation return `BAD_USER_INPUT` without revealing another tenant's object.

- Contact assignees and deal assignees must be members of the active organization.
- A deal's pipeline, stage, contact, and assignee form one tenant-consistent tuple.
- Child activities, content, form fields, and submissions scope through an organization-owned parent.
- Related user/contact projections must enforce the same organization boundary even if legacy data contains invalid cross-tenant foreign keys.
- Anonymous public-form routes derive organization only from a globally unambiguous public form identity. They never accept an organization header.

The formerly unprotected aggregate profile endpoint trusted `organization_id` from the request and exposed cross-module PII. It now requires authentication and verified organization membership. Its stale contact-column mapping was also corrected and is covered against fresh PostgreSQL.

## Contacts

### Identity and fields

A contact requires at least one of first name, last name, email, or company. Status is `active`, `inactive`, or `archived`; source is `manual`, `import`, `form`, `integration`, or `api`.

Email is not currently unique within an organization. Do not silently make it a universal identity key: public-form reuse, CSV duplicate handling, messaging recipients, and manually duplicated contacts need an explicit product decision. Email comparisons used for form reuse are case-insensitive.

GraphQL update inputs distinguish omitted from explicit null. The implemented and tested target rule is: omission preserves; explicit null or an empty string clears nullable scalar fields; explicit null resets JSON objects to `{}` and tags to `[]`; source and status cannot be null. The legacy partial `PUT` behavior remains inconsistent, so the frontend mutation flag is independent from the read flag. REST remains the default rollback path until the staging observation gate passes.

### Lists and aggregate profile

Contact lists use the shared strict page input and deterministic ordering. Existing sort fields are `created_at`, `updated_at`, `first_name`, `last_name`, `email`, and `company`; append `id` as the tie-breaker. Search currently matches first/last name, email, company, and phone with case-insensitive substring semantics.

`contactProfile` aggregates contact, invoices, signatures, payments, communications, activities, notes, lists, tasks, and bookings. Each collection needs its own bounded connection or limit and explicit partial-failure semantics. The legacy aggregator silently replaces a failed child query with an empty array, making "none" indistinguishable from "failed"; GraphQL must not hide partial data loss.

### Bulk changes and limits

- Bulk operations accept a bounded, deduplicated list of integer IDs and mutate only rows in the active organization.
- Bulk assignment validates organization membership before changing any row.
- Tag add is set-like and idempotent; tag removal removes every requested string.
- Results distinguish requested, matched, changed, and rejected rows.
- Contact creation and import serialize the count check per organization so concurrent calls cannot exceed the plan limit.
- Import skips existing and same-batch email duplicates case-insensitively when `skipDuplicates` is true.

CSV export remains authenticated HTTP because it is a streamed file response. Import remains HTTP because it is a bounded bulk-transfer job, even though the current frontend parses CSV before sending JSON. Define byte, row, column, timeout, audit, formula-injection, and error-report limits before cutover; large imports should become durable jobs.

## Tag model

Three representations coexist:

1. canonical-looking rows in `tags`;
2. freeform strings in `contacts.tags` and `deals.tags`;
3. normalized `contact_tags` and `deal_tags` junction tables used by campaign/segment code.

These stores can disagree. The NestJS schema must choose canonical tag IDs and migrate/reconcile arrays and junction rows before campaign targeting or workflow `tag_added` semantics can be trusted. Freeform suggestions may remain a separate field only if that distinction is intentional.

Legacy tag create/rename now serializes case-insensitive uniqueness. Rename plus propagation to contact arrays, and delete plus optional removal, execute transactionally. Database uniqueness remains case-sensitive, so the target migration needs a case-insensitive unique index on normalized name.

## Pipelines and deals

### Pipeline stages

Routes currently use the `pipelines.stages` JSON array while a separate `pipeline_stages` normalization table also exists. Choose one authoritative store. Stage IDs are stable opaque identifiers; names and order may change without rewriting deal identity.

- A pipeline has a non-blank name and at least one valid stage.
- Stage IDs are unique within the pipeline and every stage has a name, order, and validated color.
- A stage referenced by a deal cannot be removed until deals are moved atomically.
- Exactly one default pipeline per organization is allowed. Legacy default changes now serialize, but the target database also needs a partial unique constraint.
- Delete locks and verifies the organization-owned pipeline before checking deals, preventing an existence leak.

### Deal contract

Deal value uses the shared Decimal string boundary; currency is an uppercase supported ISO code; probability is an integer from 0 through 100. Pipeline, stage, contact, and assignee references are validated in the active organization before insert/update.

Lifecycle is:

```text
open -> won
open -> lost(reason?)
won|lost -> open
won <-> lost through the explicit terminal mutation
```

`won_at` and `lost_at` are mutually exclusive; reopening clears both and the lost reason. Every lifecycle or stage transition records activity and a durable domain event after the state transaction. The legacy lifecycle routes do not currently write those activities/events, and the stage trigger targets a dormant engine; these remain cutover blockers.

Deal and pipeline lists require stable tie-breaker ordering. Aggregate counts/values must scope by organization even when the parent ID is globally unique.

## Forms

### Definitions and fields

Form type is `form`, `survey`, or `quiz`; status is `draft`, `published`, or `archived`. Creation, duplication, and full field replacement commit the definition and ordered fields atomically. Concurrent creates serialize the per-organization plan limit.

Every field requires a supported field type and non-blank label. Validate width, options, validation rules, conditions, and `map_to_contact_field` against allowlists. Field IDs—not labels—are submission keys. Publishing requires a complete valid definition.

`notify_on_submit` and `notification_emails` are stored but no notification is sent. Conditional rules and most stored validation metadata are not enforced by public submission. These settings must not be exposed as working features until a durable implementation and tests exist.

### Public HTTP contract

Public retrieval and submission remain anonymous, rate-limited HTTP for embeds and external clients.

The database only guarantees `(organization_id, slug)` uniqueness, while the public route looks up slug alone. The target public identifier must be globally unique or include a verified organization slug. Ambiguous matches are forbidden.

Submission currently validates only required-field presence. The target validates field membership, type, length, pattern, numeric bounds, allowed options, conditional requirements, and request/body size; rejects unknown fields or stores them under an explicit raw-payload policy; and sanitizes redirect URLs.

Contact reuse/creation and submission now share one transaction. Concurrent submissions with the same organization/email serialize, producing one reused contact and preserving both submissions. Provider notifications and `form_submitted` workflow events must be durable outbox work after commit. A notification/event failure does not roll back an accepted submission and is operationally visible.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Contacts | CRUD, identifier validation, search/filter/sort/page, omitted/null fields, plan-limit race, assignee membership, tenant denial |
| Profile/content | unauthenticated denial, forged organization header, tenant denial, each child collection, bounded results, child-query failure |
| Bulk/CSV | mixed-tenant IDs, duplicate IDs, assignment denial, tag set/add/remove, size limits, duplicate email modes, plan limit, CSV escaping/formula safety |
| Tags | case-insensitive create/rename race, propagation rollback, delete modes, tenant denial, canonical-store reconciliation |
| Pipelines | stage validation, stage-in-use rejection, concurrent default changes, delete existence privacy, deterministic aggregates |
| Deals | all reference-denial cases, Decimal/currency/probability validation, pipeline/stage move, lifecycle transitions, activity/event emission, concurrent update |
| Form definitions | plan-limit race, atomic create/duplicate/field replacement, publish validation, tenant denial, omitted/null settings |
| Public forms | global identity, rate limit, all field validations, unknown fields, same-email race, submission rollback, notification/event retry, redirect safety |

## Current evidence and exit gate

Fresh PostgreSQL suites now cover contact CRUD/tenancy, profile authentication and forged-header denial, assignee denial, idempotent bulk tag changes, concurrent contact limits, tag propagation/removal and case-insensitive races, pipeline/deal CRUD and lifecycle, cross-tenant deal references, invalid stages, stage-in-use protection, default concurrency, form CRUD/fields/duplication/submissions, same-email public submission concurrency, and concurrent form limits.

The NestJS `ContactsModule` now implements `contacts`, `contact`, `createContact`, `updateContact`, `deleteContact`, `bulkUpdateContacts`, and `bulkDeleteContacts`. Fresh-PostgreSQL tests prove dual REST/GraphQL list membership, deterministic ordering, pagination totals, filters, detail projection, tenant-private missing-resource behavior, invalid-ID rejection, and suppression of corrupt cross-tenant user projections. Mutation cases additionally prove double-submit CSRF rejection/success, normalized creation, serialized plan enforcement, assignee membership, omitted-versus-null updates, one durable trigger only for an actual supplied-field change, status activity creation, foreign-tenant privacy, and exact deletion confirmation. Bulk cases prove the 100-ID boundary, request-order deduplication, mixed-tenant partial results, atomic assignment denial, idempotent tag/status updates, transactionally coupled contact/tag workflows and status activities, and dependent-activity cleanup on deletion. Create/update domain state, workflow triggers, and activities share transactions.

The shared frontend contact API has separate strict opt-ins for reads, single-row mutations, and bulk mutations, preserves the existing consumer shape, fetches and forwards CSRF for GraphQL writes, surfaces GraphQL error messages in contact modals, and defaults every path to REST. All 73 frontend cases pass. The 2026-07-16 staging rehearsals passed authenticated browser list, detail, search, inactive-status, and second-page reads through the legacy-origin `/graphql` proxy, plus equivalent REST rollback. Explicit organization headers proved isolation between two temporary staging organizations. On 2026-07-17, the deployed workspace selector proved the same isolation through user-visible selection and persisted reload behavior under GraphQL and REST reads. The bulk flag remains off pending its staging browser and rollback rehearsal.

The 2026-07-17 mutation rehearsal used a disposable staging account and real credential login against GraphQL deployment `239de591-6f1a-4be7-b10a-08a59070cc15` through backend deployment `095eb5e5-a5c4-4da4-94e8-686fb1e842f6`. Browser create, edit, activity display, and delete passed with GraphQL writes and double-submit CSRF. PostgreSQL showed the expected create/update workflow triggers. Disabling only the mutation flag repeated create/edit/delete through REST while contact reads remained on GraphQL, proving rollback without data repair. Cleanup left zero temporary users, organizations, contacts, or triggers. Privacy-safe proxy and NestJS operation events now distinguish transport/layer and record one correlated request ID, operation name/type, numeric latency, operation/error counters, and stable error codes without source, variables, response data, or identity fields.

The instrumented staging observation used GraphQL deployment `f4c6c2e3-ea1e-402e-8abe-84e002654d85` and backend deployment `4ca6b703-cb38-4161-a608-4cecee272856`. Authenticated query and create/update/delete success, plus unauthenticated-query and missing-CSRF errors, produced six exactly paired proxy/NestJS events. Correlation IDs and operation metadata matched, expected `UNAUTHENTICATED`/`FORBIDDEN` counters were present, duration was numeric, and the events contained none of the fixture credentials or contact fields. Cleanup reported zero fixture users, organizations, contacts, and triggers. The mutation flag remains disabled in deployed builds and no production traffic uses these operations.

The CRM slice is not ready for traffic until:

1. contact/deal tag arrays, tag rows, and junction tables are reconciled behind one canonical model;
2. JSON pipeline stages and the normalized stage table have one source of truth plus database constraints;
3. contact email identity policy is selected and dual-tested across manual creation, forms, imports, and messaging;
4. public forms have globally unambiguous identity, complete field validation, safe redirects, and abuse/body limits;
5. form notifications and CRM workflow events use the durable outbox/worker;
6. activities, related content, CSV boundaries, and profile partial failures have complete tests;
7. remaining bulk-contact, activity/profile, pipeline, and form browser journeys pass staging semantic-parity and rollback tests.
