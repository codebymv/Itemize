# Campaigns and workflows GraphQL cutover contract

**Status:** Campaign management plus workflow definitions and enrollment lifecycle implemented

**Evidence date:** 2026-07-21

## Decision

Authenticated campaign and workflow management moves to GraphQL. The externally invoked workflow webhook remains HTTP because it depends on raw-body HMAC verification and delivery-level retry semantics.

The NestJS implementation must preserve authorization, tenant isolation, state transitions, recipient selection, ordered workflow steps, enrollment uniqueness, and observable delivery outcomes. It must not copy the legacy in-process fire-and-forget email architecture into a resolver.

The authoritative per-operation assignment is `graphql-operation-overrides.json`. This contract defines the semantic boundary shared by those rows.

Worker behavior, trigger compatibility, step semantics, claims, retries, and provider idempotency are frozen separately in [Workflow execution cutover contract](workflow-execution-graphql-cutover.md).

## Ownership and target operations

| Legacy operation group | NestJS owner | GraphQL target |
| --- | --- | --- |
| Campaign list/detail/create/update/delete/duplicate | `CampaignsModule` | `campaigns`, `campaign`, `createCampaign`, `updateCampaign`, `deleteCampaign`, `duplicateCampaign` |
| Campaign schedule/unschedule | `CampaignsModule` | `scheduleCampaign`, `unscheduleCampaign` |
| Campaign audience preview | `CampaignsModule` | `campaignAudiencePreview` |
| Campaign send/pause/resume/test and recipients | `CampaignDeliveryModule` | `sendCampaign`, `pauseCampaign`, `resumeCampaign`, `sendCampaignTest`, `campaignRecipients` |
| Workflow list/detail/create/update/delete/duplicate | `WorkflowsModule` | `workflows`, `workflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `duplicateWorkflow` |
| Workflow activate/deactivate | `WorkflowsModule` | `activateWorkflow`, `deactivateWorkflow` |
| Enrollment create/list/lifecycle | `WorkflowEnrollmentsModule` | `enrollContactInWorkflow`, `workflowEnrollments`, `pauseWorkflowEnrollment`, `resumeWorkflowEnrollment`, `retryWorkflowEnrollment`, `cancelWorkflowEnrollment` |
| Execution operations | `WorkflowExecutionModule` | `workflowExecutionSummary`, `workflowSideEffects`, `retryWorkflowSideEffect`, `reconcileWorkflowSmsSideEffect` |
| `POST /api/webhooks/:workflowId` | `WorkflowWebhooksModule` | retained HTTP handler `processWorkflowWebhook` |

## Authentication and organization context

Every GraphQL operation in this slice requires an authenticated viewer and the canonical organization context defined by `tenancy-graphql-context.md`.

- Never accept `organizationId` as an unverified row filter.
- Resolve membership before touching campaign, workflow, recipient, contact, step, or enrollment state.
- An object outside the active organization is `NOT_FOUND`; do not reveal whether it exists.
- Child-row mutations must scope through the parent organization. Knowing both a workflow ID and enrollment ID is not authorization.
- Template, contact, tag, segment, deal, and user references must belong to the active organization when supplied.

Legacy fixes now enforce organization scope when activating stepless workflows and cancelling enrollments. These denial cases are mandatory parity scenarios.

## Shared GraphQL shapes

Use the shared error, pagination, date/time, nullability, and mutation-result rules from `graphql-shared-contracts.md`.

Recommended connection shapes:

```graphql
type CampaignPage {
  nodes: [Campaign!]!
  pageInfo: PageInfo!
}

type CampaignRecipientPage {
  nodes: [CampaignRecipient!]!
  pageInfo: PageInfo!
}

type WorkflowEnrollmentPage {
  nodes: [WorkflowEnrollment!]!
  pageInfo: PageInfo!
}
```

Campaign and workflow list ordering must be deterministic. Campaigns currently order by `created_at DESC`; workflows order by `updated_at DESC`. Add `id DESC` as the stable tie-breaker in the new implementation and parity normalization.

## Campaign contract

### Inputs and targeting

Creation requires non-blank `name` and `subject`. Sender, reply-to, template, HTML/text content, and targeting fields remain nullable where the legacy schema permits them, but the GraphQL input must distinguish omitted fields from explicit nulls.

Supported targeting modes are the stored campaign `segment_type` values. Send and preview share one validated audience compiler with explicit behavior for:

- `all`: every deliverable contact in the active organization;
- `tag`: contacts associated with any included tag ID;
- `status`: contacts matching `segmentFilter.status`;
- `segment`: contacts matching the current definition of an active organization-owned saved segment;
- excluded tag IDs: removed after inclusion filtering.

All modes exclude contacts with no email, an empty email, `email_unsubscribed = true`, or `email_bounced = true`. Preview and send must use one shared audience builder so they cannot drift.

`custom` remains unsupported and fails closed. Saved `segment` targeting is now persisted by foreign key, validated on create/update/preview/send, preserved by duplicate, and evaluated through the shared segment compiler. Preview is advisory; send snapshots eligible recipients transactionally so later segment changes do not rewrite the delivery set. The exact definition, validation, deletion, history, and parity rules live in [Audience segments GraphQL cutover contract](segments-graphql-cutover.md).

### Campaign state machine

```text
draft -> scheduled -> draft
draft|scheduled -> sending -> sent
sending -> paused -> sending
paused -> sent (when no pending recipients remain)
```

- Only `draft` and `scheduled` campaigns are editable.
- Only `draft` and `scheduled` campaigns can begin sending.
- Only `scheduled` can be unscheduled.
- Only `sending` can be paused.
- Only `paused` can be resumed.
- Deletion is rejected while `sending`; current REST behavior allows deletion in other states, including `sent`.
- Schedule input requires a valid future absolute timestamp. `timezone` is retained as metadata and defaults to `UTC`; it must not reinterpret an already absolute instant.

Invalid state transitions map to `BAD_USER_INPUT` or a dedicated stable domain code, never `INTERNAL_SERVER_ERROR`.

### Send transaction and delivery job

The send mutation must perform one database transaction that:

1. locks the organization-owned campaign;
2. confirms an allowed source state;
3. computes the audience using the shared targeting rules;
4. reserves usage without a check-then-increment race;
5. snapshots recipients with uniqueness on `(campaign_id, contact_id)`;
6. transitions the campaign to `sending`;
7. records an outbox/durable-job key;
8. commits before provider delivery starts.

The resolver returns the accepted campaign and recipient count. A worker sends recipients idempotently and records provider message IDs and per-recipient failure details. Retrying the mutation or job must not send the same campaign/contact pair twice.

Migration `039_campaign_deliveries` and `CampaignDeliveryModule` now implement this boundary. Acceptance locks the tenant-owned campaign, reuses the shared audience compiler, reserves the current month's entitlement through the locked usage row, snapshots canonical-email recipients, creates a tenant-enforced durable job, and transitions to `sending` in one transaction. Exact mutation replay returns the original job without reserving usage again. A separate leased worker calls the provider with a stable recipient-intent key and persists confirmed provider IDs, bounded retries, dead letters, or ambiguous-outcome reconciliation before deriving campaign totals.

Completion derives aggregate counts from recipient rows. Definite provider rejections retry five times and then leave that recipient `failed`; after all recipients are terminal, the campaign uses the legacy-compatible `sent` state even when some rows failed because the current enum has no `sent_with_failures`. An ambiguous provider exception is never automatically resent: its row and job become `reconciliation_required`, and the campaign becomes `failed` so operator intervention is visible. Successful recipient state is never erased.

### Pause, resume, and test sends

- Pause changes only `sending` to `paused`.
- A worker must check authoritative state between batches and leave unprocessed recipients `pending`.
- Resume processes only pending recipients and preserves cumulative counts.
- If no pending recipients remain, resume completes the campaign without resending.
- Test send requires an organization-owned campaign and validated destination email, substitutes sample variables, prefixes the subject with `[TEST]`, and does not change campaign/recipient state or usage.

`pauseCampaign` and `resumeCampaign` now use the same locked durable job. Paused campaigns are excluded from worker discovery and claim predicates; resume counts only queued, retrying, or leased recipient intents and never rebuilds the audience. A paused campaign with no active intents derives its terminal state from the persisted rows. Pre-cutover legacy sends without a durable job fail closed on GraphQL resume and must be drained or handled through retained rollback before enabling the lifecycle flag.

Provider errors must be observable and retryable. Never report a successful test send merely because the provider client was unconfigured or simulated.

## Workflow definition contract

Supported trigger types:

```text
contact_added, tag_added, tag_removed, deal_stage_changed,
form_submitted, manual, scheduled, contact_updated,
booking_created, booking_cancelled, booking_rescheduled,
invoice_paid, contract_signed, deal_won, deal_lost, deal_reopened
```

Supported step types:

```text
send_email, add_tag, remove_tag, wait, create_task,
move_deal, webhook, condition, update_contact, send_sms
```

- Create requires a non-blank name and a supported trigger type.
- If steps are supplied, they must be an array of supported step types.
- Workflow creation and all ordered steps are one transaction.
- Update validates a supplied trigger type and step array before opening the transaction.
- Omitted steps preserve the existing sequence; an explicit empty array removes all steps.
- Replacing steps is atomic and assigns contiguous one-based `step_order` values.
- Duplicate enforces the plan limit and atomically creates an inactive definition plus copied ordered steps. It never copies enrollments or execution logs.
- Activation requires organization ownership and at least one step.
- Deactivation stops new trigger matching and atomically pauses active enrollments with `pause_reason = workflow_deactivated`; activation resumes only that reason.

Plan-limit checks are part of the mutation contract. Concurrent create/duplicate requests must not both pass a non-atomic count check when only one slot remains.

## Enrollment contract

`(workflow_id, contact_id)` is unique.

- Workflow and contact must both belong to the active organization.
- A new enrollment begins at step 1 with status `active`.
- An already-active or paused pair returns a conflict/domain error.
- A completed, failed, or cancelled pair may be reactivated using the existing row, resetting execution state and trigger data.
- Manual enrollment locks the workflow and serializes competing requests so only one becomes active.
- Manual pause records its own reason, clears a live claim, and requires an explicit resume while the workflow is active.
- Failed-enrollment retry preserves `current_step` and is allowed only while the workflow is active.
- Cancellation scopes through an organization-owned workflow, clears claims and future scheduling, records completion, and terminally cancels queued, retrying, dead-letter, and reconciliation-required provider work.
- A provider call already in flight cannot be recalled. Accepted delivery may commit sent; failed or expired cancelled work becomes cancelled without another attempt.
- Dead-letter retry is tenant/workflow scoped, rejects cancelled enrollments, resets the delivery attempt cycle, and retains operator retry history.
- Enrollment lists scope through the workflow, support an explicit status filter, order by `enrolled_at DESC` plus `id DESC`, and use the shared page contract.

Execution workers must claim due active enrollments with a database lock/lease before performing external side effects. Step logs, enrollment progress, and external sends must have a retry strategy that cannot repeat a completed step.

Trigger fan-out and enrollment execution are separate durable scheduler phases and remain opt-in through rollout flags. Follow the durable execution boundary and remaining blockers in the workflow execution contract.

`workflowExecutionSummary` exposes fixed enrollment and provider-outbox status counts, effect-type counts, due and expired work, queue age, attempt totals, cancellations, dead letters, reconciliation-required SMS attempts, and operator retry history. `workflowSideEffects` supplies strict status/type filtering and bounded pagination over the same tenant-owned queue. Its projection includes safe error text, contact identity, timing, step identity, reconciliation timing/action, and provider correlation ID but never the serialized payload, recipient address, webhook destination, custom headers, authorization material, or idempotency key. `reconcileWorkflowSmsSideEffect` requires either a valid accepted Twilio SID or an explicit resend authorization and preserves the operator decision.

## Retained workflow webhook

The retained endpoint signs the exact raw JSON bytes with:

```text
HMAC-SHA256(secret, "<x-itemize-timestamp>.<raw-body>")
```

Required headers:

- `X-Itemize-Timestamp`: epoch milliseconds within five minutes of server time;
- `X-Itemize-Signature`: lowercase hexadecimal HMAC.

`X-Itemize-Delivery-Id` is recommended as the stable provider delivery key. When absent, the verified signature is the compatibility fallback. The handler claims `(workflow_id, delivery_key)` in PostgreSQL without loading or executing steps. A duplicate returns HTTP 200 with `duplicate: true`.

Accepted inputs use the canonical registry in `workflow-registry.json`; compatibility aliases normalize before comparison and storage. The normalized event must equal the workflow's saved `trigger_type`, otherwise the endpoint returns HTTP 409. Invalid bodies return HTTP 400; missing, expired, or invalid signatures return HTTP 401. Unknown workflows return HTTP 404. An inactive workflow returns HTTP 200 with `success: false`.

The clean schema now creates `workflow_triggers` and migration `020_workflow_trigger_queue` upgrades it into the shared leased event queue. The numbered migration stream includes both `007_workflow_webhook_idempotency` and `020_workflow_trigger_queue`.

For a new valid delivery the endpoint returns HTTP 202 with `accepted: true` and `execution: durably_queued`. This means the compatibility trigger was recorded for asynchronous enrollment; it is not evidence that a workflow step ran. `contactId` or `entityData.contactId` supplies the enrollment identity. Events without one complete as skipped rather than guessing. The former placeholder action executors have been removed.

The retained endpoint and first-party producers now converge on the same durable trigger matcher. The flag-aware scheduler runs due schedules, trigger fan-out, enrollment execution, and provider delivery in order; fresh PostgreSQL proves one committed contact event reaches one provider-isolated acceptance and does not replay on a second cycle. Before traffic cutover, repeat this with staging deployment flags, sandbox provider credentials, alerts, and a disable-and-drain rollback rehearsal. Silent success for a no-op action remains forbidden.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Campaign CRUD | success, validation, pagination, filters, update state restrictions, tenant denial, delete while sending |
| Audience | all/tag/status inclusion, excluded tags, unsubscribed, bounced, missing email, tenant isolation, preview/send equality |
| Campaign delivery | concurrent send request, usage boundary, recipient snapshot uniqueness, provider success/failure, retry, pause during batch, resume, completion totals |
| Test send | invalid email, tenant denial, substitution, provider failure, no state/usage mutation |
| Workflow definitions | trigger and step validation, atomic step replacement, empty-vs-omitted steps, activation without steps, tenant denial, plan-limit concurrency |
| Enrollments | same-tenant contact, cross-tenant denial, duplicate active/paused enrollment, concurrent enrollment, re-enrollment, manual pause/resume, deactivation pause/resume, same-step failed retry, cancellation including in-flight provider work, pagination/filtering |
| Provider operations | tenant/workflow ownership, summary counts and queue age, strict pagination/filtering, payload/secret omission, correlation IDs, dead-letter-only retry, ambiguous SMS quarantine, accepted-SID or explicit-resend reconciliation, cancelled enrollment denial, reset attempt cycle, retained operator history |
| Execution engine | every step type, branch selection, wait scheduling, worker claim, retry/idempotency, log and stats updates |
| Retained webhook | raw-body signature, missing/invalid/expired signature, canonical alias normalization, saved-trigger mismatch, stable delivery replay, inactive/unknown workflow, explicit non-execution response |

## Current evidence and remaining blockers

`CampaignsModule` now implements campaign list/detail/create/update/delete/duplicate, schedule/unschedule, and `campaignAudiencePreview`; `CampaignDeliveryModule` implements `campaignRecipients` and `sendCampaignTest`. Campaign queries use tenant-qualified stable paging, escaped search, safe numeric projections, private misses, and ordered link detail. Audience preview revalidates stored targeting fail-closed, compiles dynamic/static saved segments with bound parameters and tenant-correlated subqueries, and counts distinct deliverable emails after exclusion, unsubscribe, bounce, and empty-email rules. Recipient inspection verifies the tenant-owned parent, qualifies child rows and current-contact joins by organization, preserves delivery snapshots and provider evidence, strictly validates status/paging, and orders by sent time then ID. Test send locks and conceals the parent, validates destination and request identity, snapshots substituted template/campaign content, and commits a tenant-enforced leased intent before provider I/O. Stable provider keys, bounded retry, ambiguous-outcome quarantine, exact replay, and conflicting-key denial make the external effect observable without changing campaign state, recipients, or usage. Campaign mutations validate nonblank content and tenant-owned template/tag/segment references, reject legacy `custom` targeting, serialize partial updates and all state transitions with row locks, preserve explicit nullable clearing, and copy configuration into a bounded-name draft without delivery history. Independent default-off frontend read, mutation, audience-preview, recipient-read, and test-send flags preserve the retained response shape and REST rollback; bulk send/pause/resume deliberately remain on REST.

Fresh PostgreSQL coverage proves GraphQL/REST interoperability, campaign and recipient filters/paging, concurrent partial-update convergence, explicit null clearing, cross-tenant concealment, inconsistent recipient-child exclusion, foreign-reference denial, CSRF, absolute scheduling, invalid transition evidence, draft duplication, sending-state deletion denial, all/tag/status/dynamic/static preview modes, include/exclude behavior, deliverability suppression, hostile custom-field-key binding, invalid-definition failure, exact retained preview/recipient parity, test-email rendering, provider confirmation, exact replay, conflicting request denial, and zero campaign-delivery mutation. Focused compiler, service, provider, migration, and frontend tests protect every filter family, validation, snapshot/provider mapping, no-CSRF query transport, CSRF-protected delivery, retry/reconciliation outcomes, independent flags, and verified delete identity.

Existing PostgreSQL suites continue to characterize workflow CRUD, trigger validation, ordered step replacement, activation, enrollment, tenant denial, duplicate, plan limits, manual pause/resume, deactivation pause/resume, same-step retry, provider dead-letter retry, and cancellation races.

`WorkflowsModule` now implements tenant-scoped `workflows`, `workflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `duplicateWorkflow`, `activateWorkflow`, and `deactivateWorkflow`. Definition writes validate the canonical trigger/step vocabulary before opening a transaction, persist contiguous ordered steps atomically, distinguish omitted steps from an explicit empty list, validate scheduled contacts against the active tenant, and conceal foreign IDs. Create and duplicate serialize the plan-limit check with an organization advisory transaction lock. Duplicate copies the full inactive definition without runtime history. Deactivate atomically pauses active enrollments with `workflow_deactivated`; activate requires steps and resumes only that pause reason. Independent default-off read and mutation flags adapt the GraphQL result back to the retained frontend shape.

Fresh PostgreSQL coverage proves the shared stored representation, ordered creation, omitted-step preservation, atomic replacement and removal, scheduled-contact tenant denial, full inactive duplication, deactivation pause/reactivation resume, foreign-ID concealment, CSRF enforcement, invalid branch denial, and concurrent one-slot plan-limit enforcement. The full retained PostgreSQL suite remains green, as do the complete NestJS unit and frontend suites.

`WorkflowEnrollmentsModule` now implements tenant-scoped `workflowEnrollments`, `enrollContactInWorkflow`, `pauseWorkflowEnrollment`, `resumeWorkflowEnrollment`, `retryWorkflowEnrollment`, and `cancelWorkflowEnrollment`. Enrollment creates serialize through the locked workflow and the existing `(workflow_id, contact_id)` uniqueness constraint; active and paused duplicates fail closed, while terminal rows reactivate in place from step one. Lists verify the tenant-owned parent, tenant-qualify contact joins, strictly validate status and paging, and use `enrolled_at DESC, id DESC`. Manual pause state remains distinct from workflow-deactivation state, failed retry preserves `current_step`, and cancellation clears the execution claim while marking queued or ambiguous provider work so processing work can finish without another attempt. An independent default-off frontend enrollment flag preserves the retained REST response envelope and rollback path.

Fresh PostgreSQL coverage proves concurrent enrollment uniqueness, cross-tenant contact and workflow concealment, stable filtered paging, manual pause isolation, explicit resume, same-step failed retry, queued and in-flight cancellation semantics, terminal-row re-enrollment, and CSRF enforcement. Focused frontend tests prove enrollment mapping, paging, protected mutations, default-off transport selection, and the independent flag.

`WorkflowExecutionModule` now implements tenant-scoped `workflowExecutionSummary`, `workflowSideEffects`, `retryWorkflowSideEffect`, and `reconcileWorkflowSmsSideEffect`. Summary and queue queries share the tenant-owned workflow boundary, fixed status/type vocabulary, stable queue ordering, and bounded page contract. The operator projection exposes timing, state, safe error text, contact/step identity, and provider correlation while its GraphQL type contains no payload, destination, headers, authorization material, or idempotency key. Dead-letter retry is limited to uncancelled enrollments and retains operator history. SMS reconciliation locks the ambiguous intent and requires either a valid Twilio SID or an explicit resend decision; accepted reconciliation atomically records the provider identity and correlated SMS log.

Fresh PostgreSQL coverage proves exact enrollment/outbox summary counts, due work, status/type filtering, stable bounded paging, error redaction, schema-level payload omission, retry-cycle reset with retained operator history, accepted-SID reconciliation and log correlation, foreign-workflow concealment, and CSRF enforcement.

Focused tests also protect campaign send locking, pause-safe completion, campaign pagination-envelope mapping, workflow webhook signature expiry/replay, clean-schema webhook claims, engine claim collision, provider failure semantics, one-attempt Twilio message creation, tenant-scoped step mutations, safe webhook envelopes, DNS-pinned public-only webhook egress, redirect/proxy denial, bounded response handling, and invalid waits/conditions. Fresh PostgreSQL coverage proves ordered execution/logs, wait scheduling, forward branching, one provider call when two workers race an enrollment, selective lifecycle transitions, the accepted-in-flight cancellation boundary, immediate and expired-lease SMS ambiguity quarantine, accepted-SID and explicit-resend reconciliation, tenant-isolated execution metrics, strict operator filtering, and payload-free queue projections.

`WorkflowJobsModule` now implements bounded one-shot schedule dispatch and trigger fan-out. Both phases use database claims with `FOR UPDATE SKIP LOCKED`; trigger attempts have expiring leases, monotonic attempt fencing, bounded retry/dead-letter transitions, and redacted failure evidence. Targeted workflow/trigger IDs support controlled canaries. Fresh PostgreSQL races prove one schedule event, one trigger consumer, and one enrollment under competing runners, plus expired-lease recovery and rejection of stale attempts. No deployment scheduler invokes the new commands yet.

The automation surface is not fully cut over until:

- the durable enrollment and provider workers have NestJS ownership while every automation step retains execution and provider-failure coverage;
- critical workflow builder and enrollment React journeys pass against their GraphQL operations;
- after the functional slices are complete, staging canary flags, sandbox provider credentials, alerts, drain behavior, and rollback rehearsal are configured and verified.
