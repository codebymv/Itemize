# GraphQL cutover ledger workflow

The generated cutover ledger connects the Express route inventory to static frontend consumers and characterization tests in both `backend/src/__tests__` and `backend-v2/test`. It is the working queue for deciding what becomes GraphQL, what remains HTTP, and what must be reconciled before migration.

## Commands

From the repository root:

```powershell
npm run api:ledger
npm run api:ledger:check
```

`api:ledger` refreshes both the REST inventory and ledger. `api:ledger:check` is the CI drift check and does not rewrite files.

Generated artifacts:

- `!docs/API/generated/graphql-cutover-ledger.json` — machine-readable ledger with route, consumer, test, risk, and disposition evidence
- `!docs/API/generated/graphql-cutover-ledger.md` — reviewable summary, operation table, and unmatched-call queues

## Current static baseline

| Evidence | Count |
| --- | ---: |
| Registered method/path operations | 419 |
| API operations under `/api` | 412 |
| Frontend API callsites | 387 |
| Operations with frontend consumers | 365 |
| Operations referenced by backend tests | 193 |
| Unmatched frontend callsites | 0 |
| Runtime URL expressions requiring review | 0 |
| Acknowledged generic runtime URL helpers | 2 |
| Literal `${...}` inside a non-template string | 0 |
| Recommended retained HTTP operations | 37 |
| High-risk operations | 336 |

These are static matches, not production-traffic measurements. An operation with no frontend match may still serve integrations, webhooks, automation, old clients, or manually entered URLs.

## Manual decisions

Do not edit generated files. Add decisions to `!docs/API/graphql-operation-overrides.json`, keyed by the exact operation ID shown in the ledger:

```json
{
  "schemaVersion": 1,
  "operations": {
    "GET /api/contacts": {
      "disposition": "graphql-query",
      "owner": "crm",
      "targetModule": "ContactsModule",
      "targetOperation": "contacts",
      "parityStatus": "characterized",
      "risk": "high",
      "notes": "Preserve organization filtering, pagination, search, and ordering semantics."
    }
  }
}
```

Supported starting dispositions are `graphql-query`, `graphql-mutation`, `retain-http`, and `non-api`. An override can also use a project-specific disposition such as `merge-into-graphql-operation` or `remove-after-consumer-audit`, but it must include a note explaining the decision.

Suggested parity states:

- `not-started`
- `characterizing`
- `characterized`
- `implementing`
- `dual-parity`
- `consumer-migrated`
- `observing`
- `retired`

The generator preserves no implicit human state: every owner, target operation, exception, and parity state must live in the overrides file.

## Review order

1. Confirm each recommended retained-HTTP route. Webhooks, provider callbacks, health checks, multipart uploads, and binary downloads normally remain HTTP.
2. Assign owners and GraphQL targets to frontend-consumed, high-risk operations first.
3. Add characterization tests, then move the ledger state through implementation, semantic parity, consumer migration, and observation.
4. Use production traffic evidence before marking any statically unconsumed REST operation for removal.

The former 18-call unmatched queue is reconciled. Public booking/form mounts and search routing were corrected, missing invoice-payment and reputation-delete handlers were added with focused tests, onboarding reset now exposes its literal endpoint to the inventory, and two unused legacy client modules were removed. The remaining generic GET/POST `url` parameters in `frontend/src/lib/debounce.ts` are explicitly acknowledged in the override file; they are transport helpers whose callers supply the operation.

The authentication slice is the first manually assigned domain. Its 14 operations now have owners, NestJS module targets, GraphQL operation names or retained-HTTP decisions, and parity states. See [Authentication GraphQL cutover contract](contracts/auth-graphql-cutover.md).

The 11 organization operations are also assigned to `OrganizationsModule`. The shared request-context rules, role matrix, SQL isolation requirements, and organization/member transaction gates are maintained in [Tenancy and organization GraphQL contract](contracts/tenancy-graphql-context.md).

The shared [GraphQL error, pagination, and scalar contract](contracts/graphql-shared-contracts.md) defines the transport-wide error taxonomy, strict page model, date/time rules, and decimal-string boundary. Its framework-neutral normalization helpers have executable backend tests so the future NestJS exception filter, inputs, and scalars have a fixed starting point.

All 46 invoice operations are assigned across eight billing modules. Four binary or provider-facing operations deliberately remain HTTP; the remaining operations have named GraphQL targets and explicit parity states. See [Invoicing GraphQL cutover contract](contracts/invoices-graphql-cutover.md).

All 33 campaign, workflow, enrollment, workflow-side-effect, and workflow-webhook operations are assigned. Authenticated management, lifecycle, summary, queue, retry, and SMS-reconciliation operations target GraphQL across campaign and automation modules; the raw-body HMAC workflow webhook remains HTTP with a durable replay claim. See [Campaigns and workflows GraphQL cutover contract](contracts/campaigns-workflows-graphql-cutover.md).

The separate [Workflow execution cutover contract](contracts/workflow-execution-graphql-cutover.md) freezes the worker boundary. One canonical registry controls triggers and steps. All canonical automatic producers transactionally enqueue events, including real contact/tag deltas, invoice-paid transitions, linked-contact contract completion, and explicit one-shot schedules; the retained signed webhook uses the same queue. A leased matcher atomically fans events into due enrollments, and an opt-in scheduler executes them. Production scheduling invokes the enabled phases in deterministic order before provider intents are leased with stable keys and redacted dead letters. Durable step-attempt fencing, lifecycle/dead-letter policy, DNS-pinned public-only webhook egress, payload-free tenant execution queries, duplicate-safe SMS reconciliation, a contact-to-provider no-op-replay test, and the staging preflight/canary/drain harness are implemented and tested. Only executing the harness in deployed staging with sandbox credentials, alerts, and rollback ownership remains for execution rollout.

All 26 email-template, SMS-template, administrator-email, contact-delivery, and Twilio-webhook operations are assigned. Authenticated management and delivery intent target GraphQL; Twilio callbacks remain signed HTTP with durable replay claims. Inbound tenancy now comes from a globally unique organization-owned receiving number before the sender is matched inside that tenant. See [Messaging GraphQL cutover contract](contracts/messaging-graphql-cutover.md).

All 43 contact, activity, tag, pipeline, deal, form, submission, and CRM transfer operations are assigned. Authenticated management targets GraphQL; streamed CSV transfer and anonymous embedded forms remain HTTP. See [CRM GraphQL cutover contract](contracts/crm-graphql-cutover.md).

All 25 calendar, availability, booking, public-booking, OAuth, connection, and synchronization operations are assigned. Authenticated management targets GraphQL; anonymous booking protocols and the provider callback remain HTTP. See [Scheduling GraphQL cutover contract](contracts/scheduling-graphql-cutover.md).

Provider callbacks remain HTTP rather than being forced through GraphQL. Stripe invoice/subscription, Resend, Twilio, Meta, workflow, and OAuth callback boundaries are inventoried in the [Provider webhook cutover contract](contracts/provider-webhooks-graphql-cutover.md). Resend, Twilio, workflow, both Stripe callback families, and Meta now have signed replay-safe executable evidence. Stripe subscriptions additionally have deterministic same-second ordering, minimal replay snapshots, leased tenant reconciliation, and idempotent notification delivery. Resend leases and replays pending events while refusing cross-tenant provider-ID ambiguity. Meta durably claims normalized batches, bounds inline work, drains overflow with leased workers, and replays unmatched or ambiguous messages only after the local mapping becomes unique. Twilio inbound messages select their tenant from the owned receiving number and never from a globally matched sender. Workflow provider intents use a shared leased outbox and controlled egress; ambiguous outbound SMS attempts stop for tenant-scoped accepted-SID or explicit-resend reconciliation.

All 28 signature document, template, lifecycle, delivery, audit, file, and public signing operations are assigned. Authenticated metadata and lifecycle management target GraphQL; multipart/binary and capability-bearing public signing protocols remain HTTP. See [E-signatures GraphQL cutover contract](contracts/esignatures-graphql-cutover.md).

The cross-domain [File, binary, and bulk-transfer cutover contract](contracts/files-binary-graphql-cutover.md) freezes the retained HTTP boundary for signature PDFs, invoice PDFs, public logos, and contact CSV transfer. GraphQL may orchestrate metadata or upload intents, but it does not become the byte transport.

All 14 list, note, whiteboard, wireframe, and vault sharing operations are assigned. Authenticated issuance and revocation target GraphQL while public capability reads remain HTTP. Wireframe sharing is blocked because no public read or frontend viewer exists, and vault sharing remains security-sensitive because it deliberately returns decrypted secrets to a bearer. See [Public sharing GraphQL cutover contract](contracts/sharing-graphql-cutover.md).

All 9 audience-segment operations are assigned to `SegmentsModule`. Dynamic and static definitions, fail-closed filtering, tenant references, membership/count/history semantics, and saved campaign targeting are frozen in the [Audience segments GraphQL cutover contract](contracts/segments-graphql-cutover.md).

All 9 dashboard and analytics operations are assigned to `AnalyticsModule`. Strict period/ID inputs, tenant and numeric normalization, bucket merging, selected-pipeline funnels, communication lifecycle counts, and the unresolved revenue/lifecycle/timezone/stage-history decisions are frozen in the [Analytics and dashboard GraphQL cutover contract](contracts/analytics-graphql-cutover.md). The coarse `dashboardAnalytics` snapshot is implemented behind an independent default-off frontend flag; the remaining eight dedicated operations stay characterized or blocked.

Socket.IO events are a protocol surface outside the REST operation ledger. Cookie-only private room authentication, bearer-capability admission, organization isolation, event/room names, reconnect behavior, and the multi-instance/revocation blockers are frozen in the [Realtime and Socket.IO cutover contract](contracts/realtime-socketio-cutover.md).

All 6 authenticated onboarding operations are assigned to `OnboardingModule`.
They remain user-scoped across workspace changes, return deterministic typed
feature progress, serialize concurrent feature updates, and commit analytics
events with their state changes. See
[Onboarding GraphQL cutover contract](contracts/onboarding-graphql-cutover.md).

All 4 personal category operations are assigned to `CategoriesModule`.
New users receive a canonical General category, mutations preserve that
invariant, and rename/delete propagate transactionally across all five
personal content stores. See
[Categories GraphQL cutover contract](contracts/categories-graphql-cutover.md).

## Matching limits

- Parameter names are normalized, so `/:id` and `/:invoiceId` match.
- Concrete IDs in tests match parameterized routes.
- Runtime variables remain in a manual review queue unless explicitly classified in the override file. The two current entries are acknowledged generic transport helpers, not application operations.
- Query strings are not part of route matching; their filtering/pagination semantics still require characterization.
- Static call counts do not establish that a component is reachable or that an operation succeeds at runtime.
