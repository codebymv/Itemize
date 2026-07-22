# Workflow execution cutover contract

**Status:** Operator GraphQL and all four functional workers implemented; runtime scheduler cutover remains

**Evidence date:** 2026-07-21

## Decision

Workflow definition and enrollment management move to GraphQL, but execution belongs to a durable worker owned by `WorkflowExecutionModule`. A resolver may create or reactivate an enrollment and commit an outbox/job record; it must not execute provider calls in the request.

The legacy singleton remains unused, but first-party trigger callsites no longer depend on it. Contact creation/update, actual bulk tag addition/removal, deal-stage movement, form submission, booking create/cancel/reschedule, invoice-paid transitions, and linked-contact contract completion now commit a canonical `workflow_triggers` event in the same transaction as their domain mutation. Scheduled workflows persist one tenant-owned contact and one absolute run time. NestJS now owns explicit one-shot schedule, trigger, and enrollment runners: the dispatcher converts each due schedule into the shared queue exactly once; the leased trigger worker matches active workflows, evaluates the retained trigger conditions, creates or reactivates enrollments, and completes the event transactionally; and the enrollment engine executes the ordered step vocabulary behind a fenced attempt/token.

The NestJS commands `jobs:workflow-schedules`, `jobs:workflow-triggers`, `jobs:workflow-enrollments`, and `jobs:workflow-side-effects` are bounded and inert unless explicitly invoked. They support optional ID-targeted execution for canaries, recover expired leases, fence stale attempts, redact stored failures, and preserve retained state transitions. The enrollment runner commits each database mutation or provider-intent snapshot together with safe execution logs and progress; waits release the claim at an absolute timestamp. The provider runner delivers immutable email, SMS, and webhook snapshots and records only confirmed provider acceptance. No scheduler or deployment flag invokes the NestJS commands yet. The retained worker gates continue to control legacy runtime execution until final configuration reconciliation.

The retained minute scheduler still runs enabled workflow work through one ordered cycle: due one-shot schedules, trigger fan-out, enrollment execution, then provider side-effect delivery. It remains the runtime owner until the final scheduler reconciliation. Each NestJS entrypoint claims only its named phase, and the NestJS enrollment engine performs no provider I/O, so transferring a phase cannot silently broaden execution.

Email, SMS, and outbound-webhook steps snapshot a durable `workflow_side_effect_outbox` intent before the enrollment advances. `WorkflowJobsModule` now owns a one-shot provider runner that leases those intents with `FOR UPDATE SKIP LOCKED`, applies provider-specific bounded recovery, records redacted dead letters, and writes provider IDs plus email/SMS logs only after provider acceptance. Resend receives the stable outbox key. Twilio message creation gets one local attempt: a timeout, network failure, or other response without a known HTTP status moves directly to operator reconciliation, while a known rejection may retry. Outbound webhooks use direct DNS-pinned Node transports, ignore ambient proxies, reject redirects, and enforce the retained public-address and byte-limit policy. Cancellation terminates queued, retrying, dead-letter, and reconciliation-required intents; an already-running provider request may still record success, while a failed or lease-expired cancelled request becomes terminally cancelled without another attempt. The retained scheduled provider worker remains runtime owner until final configuration reconciliation.

## Canonical workflow registry

`workflow-registry.json` is now the shared trigger/step vocabulary for backend validation, the database constraint, producer constants, frontend types/options/labels, and template cards. The backend Docker context carries `backend/workflow-registry.json`; a unit test requires it to remain data-identical to the monorepo-root authority.

Canonical triggers are:

`contact_added`, `contact_updated`, `tag_added`, `tag_removed`, `deal_stage_changed`, `form_submitted`, `booking_created`, `booking_cancelled`, `booking_rescheduled`, `invoice_paid`, `contract_signed`, `manual`, and `scheduled`.

Canonical steps are:

`send_email`, `send_sms`, `add_tag`, `remove_tag`, `wait`, `create_task`, `move_deal`, `webhook`, `condition`, and `update_contact`.

The compatibility inputs `contact_created` and `deal_status_changed` normalize to `contact_added` and `deal_stage_changed`; aliases are never persisted. Numbered migration `019_workflow_registry` replaces the workflow trigger check constraint, so the booking events already emitted by legacy producers are legal definitions. Unknown triggers fail before engine database access, and workflow list/create/update validation uses the same registry.

Templates no longer advertise placeholder actions such as `send_invoice`, `update_deal`, `send_review_request`, or `update_contact_status`. Template controls render only when a caller supplies a real handler, so the static integration showcase no longer displays an inert activation button.

The retained signed `/api/webhooks/:workflowId` adapter now requires the normalized event to match the saved workflow trigger, writes into the same leased queue, and returns HTTP 202 with `execution: durably_queued`. It does not execute steps in the request. Replays return HTTP 200 with `duplicate: true`; a signed mismatched event returns HTTP 409. `contactId` or `entityData.contactId` is required for eventual enrollment; otherwise the worker completes the event with `contact_not_provided` rather than guessing tenant identity from an arbitrary entity.

## Execution boundary

The target flow is:

```text
domain transaction -> durable domain event/outbox -> trigger matcher
-> enrollment/step-attempt claim -> provider or database action
-> execution log + enrollment progress -> next durable job
```

- Domain state and its event/outbox record commit atomically.
- A worker claims a specific enrollment step with a durable attempt or lease. Multiple processes must not execute the same unclaimed step concurrently.
- Each attempt has a stable idempotency key derived from workflow, enrollment, step, and execution generation. Provider calls use it where supported.
- Provider success and local progress cannot be made atomic. A crash after provider acceptance but before the outbox is marked sent may repeat provider I/O, so the stable key is mandatory and the guarantee must be stated per provider.
- Wait steps store an absolute `next_execution_at` and enqueue no in-process timer.
- A terminal success, failure, cancellation, or pause is explicit and observable.
- Workflow deactivation pauses active enrollments with a distinct reason; activation resumes only those deactivation pauses.

Migration `020_workflow_trigger_queue` upgrades the retained trigger table into a shared event queue with organization/contact identity, canonical payload snapshots, stable event keys, attempt counts, retry time, lease expiry, redacted failure state, and terminal results. Claims use `FOR UPDATE SKIP LOCKED`; an expired processing lease can be recovered by one competing worker. Workflow matching, enrollment fan-out, and the event's completed transition occur in one transaction, so a crash cannot leave partially committed fan-out.

Migration `021_workflow_schedules` adds the explicit one-shot schedule state: `scheduled_contact_id`, `next_trigger_at`, and `last_triggered_at`. Create/update rejects missing or cross-tenant contacts and invalid timestamps. Activation requires a complete schedule. The dispatcher locks one due active workflow with `FOR UPDATE SKIP LOCKED`, clears its next run, records the fired time, and enqueues a workflow-targeted `scheduled` event in one transaction. Re-arming requires an explicit trigger configuration update; unrelated workflow edits do not replay a completed schedule.

Migration `022_workflow_execution_claims` adds a persisted execution attempt counter, UUID claim token, and lease expiry to every enrollment. The scheduler atomically claims due work with `FOR UPDATE SKIP LOCKED`. Each step then locks and revalidates that exact token/attempt before executing, and commits the database mutation or provider-intent insert, execution logs, and enrollment progress in one transaction. A recovered lease increments the attempt and replaces the token, so the stale worker cannot mutate state, create a task, queue a provider intent, or overwrite the newer worker's result. Wait and terminal transitions clear the claim; immediate steps retain and renew it across the run.

Migration `023_workflow_lifecycle` makes lifecycle intent durable. Explicit enrollment pause records `pause_reason = manual` and requires an explicit resume while the workflow is active. Workflow deactivation records `pause_reason = workflow_deactivated`, clears live execution claims, and activation selectively resumes only those enrollments; manual pauses remain paused. Cancelling an enrollment clears its claim and future schedule and cancels every queued, retrying, or dead-letter provider intent. A provider request already in flight cannot be recalled: accepted delivery may still commit `sent`, while failure or expired-lease recovery commits `cancelled` and never retries. A failed enrollment retry resumes the same `current_step` only while its workflow is active. A dead-letter operator retry resets the delivery attempt cycle while incrementing durable operator retry history.

Migration `024_workflow_sms_reconciliation` makes the Twilio ambiguity window fail safe. An expired `processing` SMS lease is never reclaimed for automatic delivery, and an immediate timeout, network failure, or other outcome without a known provider rejection is never automatically retried. Either case moves to `reconciliation_required` with durable reason and timing fields. A tenant-scoped operator must then either supply a valid Twilio message SID to record the already-accepted send and correlated SMS log, or explicitly authorize `resend`, which returns the immutable intent to `retry` and increments operator history. Cancellation terminally cancels unresolved reconciliation work.

The NestJS enrollment scheduler remains deliberately explicit-only. Provider steps define completion as durable queue acceptance, not final delivery. This lets subsequent steps proceed while delivery retries independently; operators must inspect the outbox for `retry` or `dead_letter` outcomes rather than infer provider success from enrollment completion.

The outbox key is derived from enrollment ID, step ID, and `enrolled_at`, so replaying the same run reuses one intent while a later re-enrollment creates a new generation. The first committed payload snapshot wins. Deleting the source enrollment or step clears its foreign-key reference without deleting an already committed delivery intent. Execution logs store only the step type and configuration key names; provider headers, destinations, bodies, and custom payload values remain out of routine log input.

Tenant-scoped execution visibility is explicit. `GET /api/workflows/:id/execution-summary` reports enrollment and side-effect status counts, effect-type counts, due work, expired processing leases, reconciliation-required SMS attempts, oldest queue age, attempt totals, cancellations, dead letters, and operator retry history. `GET /api/workflows/:id/side-effects` provides strict status/type filtering and bounded pagination with step/contact identity, safe error text, reconciliation timing/action fields, and provider correlation IDs. `POST /api/workflows/:id/side-effects/:sideEffectId/reconcile` resolves the ambiguous SMS state. None of these operations returns the durable payload, recipient, webhook destination, custom headers, authorization material, or idempotency key. The NestJS targets are `workflowExecutionSummary`, `workflowSideEffects`, and `reconcileWorkflowSmsSideEffect`.

`WorkflowExecutionModule` now owns those GraphQL operations plus `retryWorkflowSideEffect`. `WorkflowJobsModule` owns due-schedule dispatch, trigger fan-out, ordered enrollment execution, and provider delivery behind explicit one-shot entrypoints. The NestJS engine supports all canonical database, condition, wait, and provider-intent steps while keeping provider I/O outside request and enrollment transactions. Fresh PostgreSQL coverage proves exact status/type and due-work metrics, strict filters and bounded stable paging, safe error redaction, schema-level payload omission, tenant concealment, CSRF, dead-letter retry history, accepted-SID SMS reconciliation with correlated log persistence, single-winner schedule/trigger/enrollment/provider claims under contention, ordered mutation/log progress, wait resumption, immutable email/SMS/webhook snapshots, stable retry keys, expired-lease recovery, stale-attempt fencing, SMS ambiguity quarantine, cancellation races, correlated provider logs, and redacted failures. The legacy runtime remains available for rollback until scheduler ownership moves.

Email delivery passes the stable key to Resend, which provides provider-side deduplication. Outbound webhooks send the same value in `Idempotency-Key`; exactly-once behavior depends on the receiver honoring it. Twilio's message-create API does not provide an equivalent key in this integration. A known Twilio HTTP rejection may retry because the provider reported that it rejected the request. A timeout, network failure, missing HTTP status, or expired in-flight lease has an unknown outcome and is quarantined for operator reconciliation rather than automatically resent. This is not exactly-once delivery: it is duplicate-safe recovery with an explicit operator decision between acknowledging provider acceptance and accepting resend risk.

## Step contract

| Step | Required behavior |
| --- | --- |
| `send_email` | Validate and snapshot recipient/rendered template data, queue one run/step intent, send with the stable provider key, and store provider identity only after acceptance. Unconfigured delivery retries and eventually dead-letters. |
| `send_sms` | Snapshot the rendered message and organization-owned sending number, make one provider-create attempt per claim, quarantine immediate ambiguous outcomes and expired in-flight attempts, and require either a valid Twilio SID or explicit operator-authorized resend. |
| `add_tag` / `remove_tag` | Mutate only a contact in the enrollment organization; repeated execution is idempotent. |
| `wait` | Accept only a finite non-negative duration, persist the absolute next time, and stop the current run. |
| `create_task` | Require the assignee to be a member of the workflow organization and preserve `created_by` separately from `assigned_to`. |
| `move_deal` | Require an organization-owned deal and valid destination stage; use the canonical stage input name. |
| `webhook` | Validate and snapshot the URL, method, headers, and protected envelope; enforce timeout/size limits and controlled egress; send the stable idempotency header; store response metadata; and retry only under an explicit policy. |
| `condition` | Validate the operator and forward-only branch targets; missing required data and unknown operators fail closed. |
| `update_contact` | Allowlist mutable fields and scope the update to the enrollment organization. |

Condition branch targets must be integers, inside the step list, and strictly later than the condition step. This prevents self/backward recursion. Workflow creation/update now rejects invalid targets.

## Webhook egress policy

Outbound workflow webhooks now use a controlled Node HTTP boundary rather than ambient `fetch`. Production requires HTTPS; credentials, local/internal hostnames, non-public literal addresses, and every DNS answer outside globally routable unicast space are rejected. A mixed public/private DNS answer fails closed. The validated address set is pinned into the connection lookup, proxy environment variables are ignored, and redirects are disabled, so a second DNS lookup or redirect cannot switch the request to an unvalidated destination.

Request JSON defaults to a 256 KiB cap and response bytes to 64 KiB; both are configurable from 1 KiB through 1 MiB with `WORKFLOW_WEBHOOK_MAX_REQUEST_BYTES` and `WORKFLOW_WEBHOOK_MAX_RESPONSE_BYTES`. Responses are requested without compression and the worker retains its ten-second bounded timeout. Tenant headers cannot replace host, framing, forwarding, proxy, tracing, user-agent, idempotency, or Itemize delivery headers. `Authorization` and ordinary webhook-specific headers remain available.

Network failures, temporary DNS failures, HTTP 408/425/429, and 5xx responses use the bounded retry schedule. Redirects, ordinary 4xx responses, prohibited DNS results, and request/response policy-limit failures dead-letter immediately. Errors persist only redacted policy descriptions; destination URLs, credentials, and response bodies are not logged.

## Required parity scenarios

- Trigger matching succeeds for the canonical event payload and fails closed when configured condition data is absent.
- Cross-organization contact, tag, deal, task assignee, and update references are denied.
- Two workers racing the same enrollment produce one durable side-effect intent and one successful step transition.
- Two delivery workers racing one queued or expired-leased intent produce one ordinary provider call and one sent transition.
- A provider simulation or known rejection leaves the durable intent retryable or dead-lettered without falsely writing a sent log; an ambiguous SMS timeout or network failure stops in reconciliation-required state without another provider call.
- Ordered database-only steps write ordered execution logs and advance once.
- Wait persists the next execution time without running the following step.
- Condition true/false branches skip only the intended forward steps; invalid operators and targets fail.
- Cancellation/pause/deactivation races do not allow an already-claimed worker to overwrite authoritative state.
- Retry after a process crash preserves the same immutable payload and idempotency key; email deduplicates at the provider, webhooks require receiver cooperation, and an ambiguous SMS attempt stops for explicit accepted-SID or resend reconciliation.
- Webhook URL, redirect, DNS resolution, timeout, payload protection, response-size, and retry rules are covered.

## Current evidence and exit gate

Fresh PostgreSQL tests prove atomic trigger rollback with its domain transaction, real-delta contact/tag events, invoice-paid emission across manual and Stripe paths, linked-contact contract completion, exactly-once due-schedule dispatch across competing workers in both implementations, single-consumer event claims, expired trigger-lease recovery, stale-attempt fencing, condition matching, enrollment scheduling, an enabled contact API event flowing through ordered trigger, enrollment, and provider phases exactly once with a no-op second cycle, ordered database steps, execution logging, persisted waits, one provider outbox row under concurrent enrollment execution, stale enrollment-worker fencing after lease recovery, one provider call under concurrent delivery claims, immutable retry with a stable key, redacted failure storage, provider-log correlation, expired provider-lease recovery, immediate ambiguous SMS quarantine, expired-lease SMS quarantine with zero automatic provider calls, accepted-SID reconciliation, explicit resend authorization, reconciliation audit history, manual pause isolation, selective deactivation resume, same-step failed-enrollment retry, dead-letter operator retry history, cancellation across queued and in-flight provider work, queue-age/count accuracy, operator filter validation, tenant denial, and payload/secret omission. Unit tests cover the NestJS runner bounds and targeted mode, retained trigger-condition aliases, retry/dead-letter/stale outcomes, rollout flag defaults and phase order, trigger-key validation, bounded retry/redaction, trigger fail-closed behavior, connection cleanup, claim collision, tenant-scoped mutations, assignee membership, provider-free queueing, one-attempt SMS creation and outcome classification, email/SMS/webhook dispatch contracts, public-address classification including IPv4-mapped IPv6, mixed DNS-answer rejection, pinned resolution, redirect/proxy denial, protected headers, byte limits, explicit retryable status policy, invalid waits/conditions, and the production execution-claim, lifecycle, and SMS-reconciliation migrations.

The retained code-level and deployed-staging execution gates are complete. On 2026-07-16 the [workflow rollout runbook](../../Deploy/workflow-rollout-runbook.md) was executed against an isolated fresh Railway PostgreSQL service: the identity-pinned preflight passed with empty queues, the ID-scoped canary produced one correlated Resend test-address acceptance, cleanup retired its workflow/contact fixtures, and the separately confirmed disable-and-drain rehearsal finished with zero residual work. The next code slice is NestJS provider delivery ownership. Only after that functional slice should scheduler ownership, queue-age/failure/reconciliation alert routing, dead-letter ownership, and rollback configuration change.
