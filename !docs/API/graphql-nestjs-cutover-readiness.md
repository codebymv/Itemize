# GraphQL + NestJS cutover readiness

**Status:** Phase 0 baseline validated; Phase 1 foundation and first read slice implemented

**Evidence date:** 2026-07-16
**Authority:** This document supersedes the testing counts and cutover-testing guidance in `ts-nest-rewrite.md`.

## Decision

The target public API is GraphQL on NestJS. Do not rebuild the complete REST surface in NestJS as a prerequisite. Extract transport-neutral domain services, expose them through GraphQL, and retain the legacy Express routes until each consumer scenario has passed a semantic cutover gate. A temporary NestJS REST adapter is appropriate only when a specific client cannot move with its GraphQL operation.

Parity means the same authorization decisions, domain state transitions, side effects, and user-visible outcomes. It does not mean forcing GraphQL responses and errors to imitate REST envelopes byte-for-byte.

## Verified baseline

The reproducible source inventory is [generated/rest-surface.md](generated/rest-surface.md). Run `npm run api:surface` after changing Express routes and `npm run api:surface:check` in CI.

| Surface | Verified snapshot | Interpretation |
| --- | ---: | --- |
| Express route declarations | 421 | Static declarations under `backend/src`, excluding tests and comment examples |
| Unique resolved method/path operations | 416 | Includes 411 `/api` operations and 5 documentation/health/fallback routes; this is the migration ledger input, not a claim that all operations are externally reachable |
| Backend test files | 76 | Includes database safety/bootstrap, workflow-registry drift and alias behavior, transactional trigger enqueue and leased workers, webhook idempotency, tenant denial, shared GraphQL contracts, analytics parameters, realtime authorization, OAuth-state route/signing coverage, signature/file delivery, public-upload isolation, logo validation, CSV-transfer policy, public-sharing, audience-segment, campaign delivery, messaging delivery, ordered workflow rollout and staging safety, workflow execution/controlled egress, SMS provider ambiguity, and billing/scheduling concurrency tests added during Phase 0 |
| Real-database integration suites | 27 | 436/436 passed against a database built from zero, including live Socket.IO authorization, analytics tenant/bucket/number semantics, concurrent Stripe invoice/subscription delivery, deterministic ordering and reconciliation workers, invoice numbering, estimate conversion, CRM and CSV-transfer boundaries, booking collision prevention, audience calculation/campaign snapshots, signature integrity, public-sharing issuance/revocation, all canonical workflow producers, one-shot scheduled dispatch, leased trigger fan-out, an enabled contact-to-provider workflow cycle, an ID-scoped staging canary with automatic fixture retirement, durable enrollment-step fencing, workflow pause/deactivation/retry/cancellation policy, payload-free workflow execution visibility, webhook-upgrade replay compatibility, provider-outbox claims, outbound SMS ambiguity quarantine and operator reconciliation, owned-number Twilio routing/replay, Resend verification/replay/ordering/reconciliation, and signed replay-safe Meta batch routing/reconciliation |
| All backend test cases | 721 | 285/285 non-database cases and 436/436 fresh-PostgreSQL cases passed on 2026-07-16 |
| Frontend test files | 8 | 52/52 cases pass; coverage remains mostly utilities/configuration plus campaign saved-segment and vault-sharing API consumer contracts, not broad browser cutover coverage |
| Direct `{ error: ... }` JSON response sites | 300 | Evidence of an error-contract normalization problem, not necessarily 300 distinct shapes |

The 27 database integration suites cover realtime Socket.IO authorization, analytics, automation execution, workflow trigger queueing, bookings, calendars, campaigns, contacts and CSV transfer, email templates, Resend email webhooks, Meta social webhooks, estimates, forms, invoice actions, invoices, lists, notes, organizations, pipelines, public sharing, audience segments, signatures, SMS messaging/webhooks, Stripe invoice and subscription webhook concurrency, tags, and workflows. Several suites include cross-organization or cross-owner denial scenarios, so isolation is not wholly untested. Coverage is still far smaller than the 410-operation `/api` surface and is concentrated in selected domains.

The former claim of 8 suites and 73 tests was stale. The current baseline was executed with the disposable runner on 2026-07-16: all 94 expected tables and 61 top-level migration markers were verified before all 27 suites and 436 tests passed.

## Phase 1 GraphQL foundation now in place

The isolated `backend-v2/` workspace now boots NestJS 11 with code-first GraphQL and Apollo Server 5. It is not part of the legacy Railway build/start commands and receives no production traffic.

The first vertical foundation implements the existing access-cookie contract, verifies `itemize_auth` with the shared JWT secret, selects organization context only from `x-organization-id` or the user's database default, re-reads current membership and role from PostgreSQL, and propagates the verified identity through `AsyncLocalStorage`. A public `readiness` query and protected `viewerContext` query prove the middleware and guard chain.

The first domain read slice exposes tenant-scoped `contacts` and `contact` queries through a transport-neutral service and parameterized repository. It preserves legacy search, status, tag, assignee, sorting, and page semantics while adding strict inputs and deterministic ID tie-breaking. Cross-tenant detail reads return tenant-private `NOT_FOUND`. The comparison suite also found and repaired ambiguous unqualified columns in the legacy contact search query.

`npm run build:graphql` passes. `npm run test:graphql` covers 19 focused cases across the foundation, organization context, contact service validation/error mapping, and repository SQL/connection behavior. The disposable runner executes 10 NestJS GraphQL cases against freshly initialized PostgreSQL: 4 context cases plus 6 contact cases covering dual REST/GraphQL list membership/order/page counts, filters, detail projection, cross-tenant privacy, invalid identifiers, and denial of user projections through corrupt cross-tenant references. Contact mutations, CSRF enforcement, consumer migration, and browser tests remain required before traffic cutover.

## Phase 0 work now in place

1. **Database blast-radius guard.** Integration tests require `TEST_DATABASE_URL`; they never fall back to `DATABASE_URL`, reject an identical URL, and reject ambiguously named databases unless isolation is explicitly acknowledged. Configuration starts from `backend/.env.test.example`.
2. **Reproducible REST inventory.** `scripts/generate-api-surface.js` statically resolves mounted routers without booting the app, connecting to PostgreSQL, or initializing external services. It produces JSON for tooling and Markdown for review.
3. **Drift checks.** `npm run api:surface:check` fails when the committed baseline is stale. `npm --prefix backend run test:integration:config` verifies the database guard without opening a database connection.
4. **Fresh database runner.** `npm run test:integration:fresh` in `backend/` creates PostgreSQL 16 with Docker, resets the guarded schema, uses the real application initializer, verifies 94 expected tables and 61 migration markers, disables inherited email/SMS/storage/payment/AI provider credentials, runs the integration suites, and destroys the database. The complete gate passed on 2026-07-16. See [Disposable integration database](../Tests/integration-database.md).
5. **Strict grouped migrations.** A grouped migration that reports internal failures is no longer recorded as successful.
6. **Stripe webhook idempotency.** Invoice webhook processing now claims a unique Stripe event inside the same transaction as payment/invoice mutations, serializes by payment reference, rejects a previously recorded payment reference, locks the invoice row, and rolls back the claim on failure. Both the application initializer and numbered production migration stream create the event table; production startup requires migration `006_stripe_webhook_idempotency`.
7. **REST-to-GraphQL cutover ledger.** `npm run api:ledger` correlates all 416 registered operations (411 under `/api`) with static frontend callsites and backend test references, recommends initial transports, assigns evidence-based risk, and exposes review queues. Human decisions and acknowledged dynamic helpers live in `graphql-operation-overrides.json`; see [GraphQL cutover ledger workflow](graphql-cutover-ledger-workflow.md).
8. **Frontend-route reconciliation.** All 18 previously unmatched frontend calls are resolved: incorrect public booking/form and search paths were fixed, missing invoice-payment and reputation-delete handlers were implemented, onboarding reset was made statically traceable, and unused legacy API wrappers were removed. The ledger now has zero unmatched calls and zero unreviewed runtime expressions.
9. **Authentication slice assignment and contract.** All 14 auth operations have owners, target `AuthModule` operations or retained-HTTP decisions, and parity states. The [authentication cutover contract](contracts/auth-graphql-cutover.md) freezes cookies, CSRF, identity, tenancy context, errors, transaction boundaries, and required scenarios. The active Google flow now validates provider tokens server-side instead of trusting browser-supplied identity fields.
10. **Tenancy context and organization slice.** All 11 organization operations are assigned to `OrganizationsModule`, and the [tenancy contract](contracts/tenancy-graphql-context.md) freezes request-context selection, the role matrix, error semantics, transaction boundaries, and row-level SQL requirements. Direct middleware tests cover explicit/default membership, outsider and role denial, invalid IDs, missing auth, optional context, and connection cleanup.
11. **Shared GraphQL transport contract.** The [shared contract](contracts/graphql-shared-contracts.md) freezes stable error codes, strict page-based pagination, scalar transport rules, nullability, and mutation-result conventions. Framework-neutral helpers and 20 tests prove normalization, internal-error redaction, page metadata, and precision-preserving decimal serialization.
12. **Invoicing slice assignment and contract.** All 46 invoice operations are assigned across eight billing modules with named GraphQL targets, retained-HTTP exceptions, risk, and parity status. The [invoicing contract](contracts/invoices-graphql-cutover.md) freezes decimal and currency boundaries, numbering, state transitions, transaction/locking rules, side-effect retry behavior, and the required parity matrix.
13. **Billing concurrency primitives.** Direct invoice creation, estimate conversion, manual recurring generation, and scheduled recurring generation now share an atomic PostgreSQL invoice-number allocator. Estimate numbering takes an organization-scoped transaction advisory lock; conversion locks its source; recurring routes lock tenant-owned templates; and background runners claim due templates with `FOR UPDATE ... SKIP LOCKED`. Manual invoice payments also lock their invoice so simultaneous payments accumulate without a lost update, and invalid payment-method values return a client error instead of leaking a constraint failure as HTTP 500. Focused query tests and real-PostgreSQL concurrent scenarios all pass.
14. **Campaigns and workflows slice.** All 33 campaign, workflow, enrollment, workflow-side-effect, and workflow-webhook operations have owners and named targets across `CampaignsModule`, `CampaignDeliveryModule`, `WorkflowsModule`, `WorkflowEnrollmentsModule`, `WorkflowExecutionModule`, and retained `WorkflowWebhooksModule` HTTP handling. The [campaigns/workflows contract](contracts/campaigns-workflows-graphql-cutover.md) freezes state machines, targeting, tenant scope, enrollment concurrency/lifecycle, execution observability, HMAC/replay behavior, side-effect boundaries, and required parity scenarios. Campaign list envelope mapping, send locking, pause-safe completion, cross-tenant enrollment cancellation, manual/deactivation pause separation, same-step retry, payload-free execution metrics/queue queries, dead-letter operator retry, SMS reconciliation, enum validation, simultaneous enrollment, and durable webhook claims now have executable coverage.
15. **Messaging slice.** All 26 email-template, SMS-template, administrator-email, contact-delivery, and Twilio-webhook operations have owners and named targets across `EmailTemplatesModule`, `SmsTemplatesModule`, `MessagingDeliveryModule`, `AdminMessagingModule`, and retained `SmsWebhooksModule` handlers. The [messaging contract](contracts/messaging-graphql-cutover.md) freezes rendering, tenant scope, delivery states, provider boundaries, admin batching, and webhook verification/replay behavior. Clean-schema activity/log writes, provider-unavailable semantics, globally unique organization-owned receiving numbers, tenant-first inbound routing, concurrent replay, unmatched/ambiguous quarantine, status replay, and durable webhook claims now have PostgreSQL coverage.
16. **Workflow execution trigger, enrollment, lifecycle, provider, egress, visibility, SMS-reconciliation, and rollout boundaries.** The [execution contract](contracts/workflow-execution-graphql-cutover.md) defines the durable worker target. `workflow-registry.json` supplies one trigger/step vocabulary to backend validation, database constraints, producers, frontend types/options/labels, and templates; a test keeps the deployable backend copy synchronized with the monorepo authority. All canonical automatic producers enqueue into one transactionally durable queue: contact create/update, actual tag add/remove, deal stage, form submission, booking create/cancel/reschedule, invoice paid, linked-contact contract completion, and explicit one-shot schedules. The retained signed webhook uses the same queue and returns `execution: durably_queued`. A `SKIP LOCKED` worker leases events, atomically matches workflows and activates due enrollments, while a separate opt-in scheduler executes those enrollments. Both phases default off for controlled rollout. Production scheduling now invokes one flag-aware ordered cycle: due schedules, trigger fan-out, enrollment execution, then provider delivery. Provider steps snapshot one durable intent per enrollment run/step; a separate leased worker retries with bounded delay and redacted dead letters, passes stable keys where providers support them, and writes correlated logs only after acceptance. Lifecycle and dead-letter retry policies are durable. Outbound webhooks use DNS-pinned public-only egress. Tenant-scoped summary and queue queries expose ages, attempts, failures, cancellations, dead letters, reconciliation state, retry history, and provider correlation IDs without payload leakage. Expired in-flight SMS attempts stop for accepted-SID or explicit-resend operator reconciliation instead of automatically duplicating Twilio I/O. Fresh PostgreSQL proves a real contact API mutation reaches one provider-isolated accepted delivery through all enabled phases and that a second cycle is a no-op. On 2026-07-16 the deployed Railway staging gate passed migration/backlog preflight, one ID-scoped Resend test delivery with correlated provider evidence, automatic fixture retirement, and a confirmed zero-residual disable-and-drain rehearsal. Formal alert routing and named production operational owners remain release actions.
17. **CRM slice.** All 43 contact, activity, tag, pipeline, deal, form, submission, CSV-transfer, and public-form operations have owners and targets across eight CRM modules. The [CRM contract](contracts/crm-graphql-cutover.md) freezes tenancy, aggregate PII, plan limits, bulk semantics, tag/stage model conflicts, deal references/lifecycle, form transactions, and retained public HTTP behavior. The unauthenticated aggregate contact-profile exposure and stale schema mapping are fixed; fresh PostgreSQL now covers forged tenant headers, assignment/reference denial, bulk tag semantics, plan/default/tag races, stage integrity, and same-email public submissions.
18. **Scheduling slice.** All 25 calendar, availability, booking, public-booking, OAuth, connection, and sync operations have named GraphQL or retained-HTTP targets across five modules. The [scheduling contract](contracts/scheduling-graphql-cutover.md) freezes interval/timezone rules, collision locking, lifecycle, public capability behavior, signed OAuth state, provider-secret handling, sync jobs, and durable booking events. Legacy booking writes now serialize overlap checks with inserts/updates, calendar deletion uses the same lock, and Google OAuth state is signed, expiring, membership-checked, and redirect-safe. Fresh PostgreSQL proves simultaneous same-slot exclusion and cancellation-token binding/replay behavior.
19. **E-signatures slice.** All 28 document, template, lifecycle, delivery, audit, file, and public-signing operations have named GraphQL or retained-HTTP targets across five modules. The [e-signatures contract](contracts/esignatures-graphql-cutover.md) freezes tenant/reference boundaries, draft immutability, lifecycle/concurrency, hashed capabilities, signer assurance, evidence, storage, and job boundaries. Legacy cancellation now actually transitions state and revokes tokens, sends serialize, reminders preserve terminal recipients and enforce tenancy, unsupported OTP assurance fails closed, unknown fields are rejected, and local file paths use a traversal-safe upload root.
20. **Public-sharing slice.** All 14 list, note, whiteboard, wireframe, and vault share operations have named GraphQL or retained-HTTP targets across three modules. The [public-sharing contract](contracts/sharing-graphql-cutover.md) freezes personal ownership, capability issuance/rotation/revocation, public projections, cache/privacy headers, sanitization, vault-secret semantics, realtime revocation, and the missing wireframe viewer. Legacy issuance is now concurrency-safe, revoke clears tokens, re-share rotates them, nested content is sanitized, public reads are no-store/noindex, and the vault frontend consumes the actual response envelope.
21. **Audience-segment slice.** All 9 segment operations are assigned to `SegmentsModule`. The [audience-segment contract](contracts/segments-graphql-cutover.md) freezes the typed dynamic/static definition, fail-closed operator vocabulary, tenant references, parameterized evaluator, calculation/history concurrency, pagination, and saved campaign targeting. Legacy preview/count/membership/campaign preview/send now share the same evaluator; campaign `segment_id` is persisted by foreign key and recipient snapshots no longer broaden to every eligible contact.
22. **Analytics and dashboard slice.** All 9 analytics operations are assigned to `AnalyticsModule`. The [analytics contract](contracts/analytics-graphql-cutover.md) freezes strict period inputs, tenant and numeric semantics, selected-pipeline funnels, lifecycle communication counts, bucket identity, database-client serialization, and required parity scenarios. PostgreSQL coverage now proves the fixed mechanics; revenue recognition/currency, contact lifecycle, reporting timezone, and true stage-transition velocity remain explicit blockers rather than accidental legacy behavior.
23. **Realtime and Socket.IO slice.** The [realtime contract](contracts/realtime-socketio-cutover.md) freezes cookie-only private-room authentication, public/chat capability rules, organization chat/social separation, event envelopes, reconnect behavior, and the decision to retain Socket.IO during the GraphQL cutover. Legacy joins now validate inputs and database state, organization rooms enforce membership, typing spoof attempts fail closed, raw capabilities are removed from logs, browser clients rejoin with credentialed handshakes, and database clients no longer leak. Thirteen unit cases plus five live Socket.IO/PostgreSQL scenarios prove the boundary. Adapter-wide presence, immediate revocation eviction, durable domain-event delivery, and browser reconnect coverage remain explicit blockers.
24. **File, binary, and bulk-transfer slice.** The [file/binary contract](contracts/files-binary-graphql-cutover.md) keeps multipart uploads, private PDF streams, generated PDFs, public logo bytes, and CSV transfer outside GraphQL while freezing their shared auth, tenant, storage, header, filename, size, and lifecycle rules. Signature uploads now validate PDF bytes and draft/template tenancy, private signature files are no longer exposed by the static upload mount, delivery refuses arbitrary remote URLs and unsafe local/S3 paths, logo writes validate actual image bytes and own their storage URL, and CSV export neutralizes spreadsheet formulas with bounded imports/exports. Thirty focused non-database cases plus two fresh-PostgreSQL contact-transfer scenarios cover this boundary. Malware/structural parsing, private-bucket policy, byte ranges, staged cleanup, evidence retention, and multi-instance storage remain explicit blockers.
25. **Provider webhook slice.** The [provider webhook contract](contracts/provider-webhooks-graphql-cutover.md) inventories Stripe invoice/subscription, Resend, Twilio, Meta, workflow, and Google OAuth callback protocols and freezes raw-body verification, durable delivery claims, occurrence-time ordering, acknowledgement, reconciliation, tenant mapping, and redaction. Resend verifies real Svix signatures, deduplicates by delivery ID, prevents out-of-order status regression, updates email/campaign milestones and contact suppression, and leases pending events while refusing cross-tenant provider-ID ambiguity. Meta verifies exact-body HMAC signatures, durably claims complete normalized batches, bounds inline work, drains overflow with leased workers, reconciles unmatched/ambiguous mappings without tenant guessing, and emits sockets only after commit. Twilio inbound callbacks select tenancy from an organization-owned receiving number before matching the sender inside that tenant. Stripe subscription callbacks add minimal replay snapshots, deterministic same-second ordering, leased tenant reconciliation, and idempotent upgrade notifications. Workflow provider intents share a leased outbox, outbound webhooks use controlled public-only pinned egress, and ambiguous outbound SMS attempts have tenant-scoped reconciliation controls.

## P0 implementations verified against PostgreSQL

### 1. Reproducible disposable database provisioning

The fresh runner and schema contract are implemented and passed locally on 2026-07-15. Clean initialization also proved that required migration failures stop startup and that onboarding, email-authentication, invoicing/estimates, and landing-page dependencies are created in a valid order.

**Gate result:** `npm run test:integration:fresh` passed with 94 tables, 61 markers, 27 suites, and 436 tests. CI should run the same command; no shared long-lived database is used.

### 2. Stripe invoice webhook idempotency

The legacy handler now has transactional event claims and payment-reference deduplication, with unit/route tests for duplicate delivery, duplicate payment references, commit, and rollback.

**Gate result:** the concurrent-delivery scenario passed against fresh PostgreSQL. Preserve this behavior as the NestJS semantic contract.

## Remaining P0 blockers

### 3. REST operation to GraphQL operation ledger

The generated ledger now supplies an initial disposition and evidence for every REST operation, and its unmatched frontend queue is empty. Human decisions now cover 256 authentication, organization, invoicing, campaign, workflow, enrollment, messaging, CRM, scheduling, e-signature, file-transfer, public-sharing, audience-segment, analytics, and retained-protocol operations. Owners still need to approve the recommendations and name targets for the remaining domains.

The ledger should record:

- REST method/path and source location
- frontend and external consumers
- required role and tenant boundary
- input, validation, and nullability rules
- domain state changes and transaction boundary
- external side effects and idempotency key
- GraphQL operation/field and owning NestJS module
- parity scenarios and cutover status

Webhook receivers, OAuth callbacks, health checks, downloads, and some uploads normally remain HTTP endpoints; GraphQL is not a reason to force non-GraphQL protocols into the schema.

### 4. Frozen cross-cutting contracts

Authentication, tenancy, shared error/pagination/scalar rules, invoicing, campaigns, workflows, enrollments, messaging delivery, CRM, scheduling, e-signatures, file/binary transfer, public sharing, audience segments, analytics, and their retained webhook/public/binary/OAuth protocols are now documented in dedicated contracts. Before implementing the remaining slices, document and test the observable behavior of:

- field-specific ordering, filtering, search, and null semantics not covered by the shared transport rules
- file malware/structural validation, private-bucket policy, byte ranges, staged cleanup, evidence retention, and multi-instance storage behavior
- provider dead-letter operator controls and the remaining provider retry/transaction boundaries in the provider contract
- remaining realtime multi-instance presence, immediate capability-revocation eviction, durable event delivery, and browser reconnect/refetch behavior

Socket.IO now has a dedicated contract plus unit and live PostgreSQL protocol coverage. It remains a separate compatibility surface during the GraphQL migration; Redis-adapter fan-out/presence, immediate revocation, and browser recovery are still required before multi-instance production cutover.

Workflow execution has a dedicated contract and its code-level and deployed-staging rollout gates are complete. Every canonical automatic producer writes the shared queue, scheduled workflows have an explicit one-shot contract, trigger events and provider delivery are durably queued and leased, due enrollment steps use persisted attempt/token fencing, lifecycle/dead-letter policies are durable, outbound webhooks use public-only DNS-pinned egress, tenant-scoped operator queries expose queue and failure metrics without payload leakage, ambiguous Twilio attempts stop for explicit reconciliation, and an ordered enabled cycle is proven end to end from contact API mutation through provider acceptance. The staging harness passed migration/configuration/backlog preflight, an ID-scoped Resend test-address canary, JSON evidence capture, fixture retirement, and a confirmed global disable-and-drain rehearsal on 2026-07-16. Remaining release work is formal alert routing, named dead-letter/SMS-reconciliation owners, and the production change window.

### 5. Consumer-level verification

Eight frontend test files do not establish that the React application can cut over safely. Add consumer scenarios around authentication, organization switching, CRUD, pagination, optimistic updates, uploads, billing/invoicing, campaigns/workflows, sharing/revocation, and realtime updates. At least the critical paths need browser-level smoke tests against the GraphQL stack.

## Required test layers

| Layer | What it proves | Cutover requirement |
| --- | --- | --- |
| Domain service unit tests | Business rules independent of Express, NestJS, or GraphQL | Required for extracted services and high-risk calculations/state machines |
| PostgreSQL integration tests | SQL, constraints, transactions, tenancy, and migrations | Run against a database built from zero |
| Legacy REST characterization tests | Current observable semantics for still-supported behavior | Required per ledger scenario before reimplementation |
| GraphQL resolver/operation tests | Schema inputs, auth, nullability, error codes, and output shape | Required for every target query/mutation |
| Dual semantic parity tests | Equivalent authorization, normalized domain state, and side effects | Required per migrated scenario; do not compare transport envelopes literally |
| Protocol contract tests | Webhooks, OAuth callbacks, uploads/downloads, health, Socket.IO | Required before changing the owning implementation |
| Frontend/browser tests | Real consumer behavior through the new API | Required for critical user journeys before traffic cutover |
| Operational tests | Logging, correlation IDs, rate limits, timeouts, shutdown, observability | Required before production traffic |

## Recommended sequence

1. Keep `npm run test:integration:fresh` as a required CI gate so clean bootstrap and all 27 database suites remain continuously proven.
2. Continue assigning owners and GraphQL targets after the 256 authentication, organization, invoicing, campaign, workflow, enrollment, messaging, CRM, scheduling, e-signature, file-transfer, public-sharing, audience-segment, analytics, and retained-protocol operations already decided, prioritizing frontend-consumed high-risk operations.
3. Freeze the remaining field-specific query and provider-webhook contracts; implement the documented file-storage, realtime adapter/revocation, and browser gates and keep existing slice contracts current as characterization expands.
4. Define the GraphQL schema and NestJS module boundaries around domain behavior, not legacy route-file boundaries.
5. Extract or reimplement transport-neutral services and add PostgreSQL integration tests.
6. Migrate vertical slices: GraphQL operation, consumer change, semantic parity, observability, then retire the corresponding REST consumer path.
7. Cut over only after critical browser journeys and rollback behavior pass in a production-like environment.

## Per-slice exit gate

A slice is ready to cut over only when all of the following are true:

- its ledger row has an explicit disposition and owner
- auth and tenant-denial cases pass
- success, validation, not-found, conflict, and failure paths are characterized
- database state and external side effects match the intended semantics
- retries are safe for mutations that can be repeated
- the frontend or external consumer uses the new operation successfully
- metrics/logs distinguish legacy and GraphQL execution
- rollback does not require data repair

The Express backend can be retired only after all externally used ledger rows are migrated, deliberately retained, or deliberately removed and the observation window shows no legacy traffic.
