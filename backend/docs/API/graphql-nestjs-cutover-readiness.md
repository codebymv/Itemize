# GraphQL + NestJS cutover readiness

**Status:** Phase 0 baseline  
**Evidence date:** 2026-07-15  
**Authority:** This document supersedes the testing counts and cutover-testing guidance in `ts-nest-rewrite.md`.

## Decision

The target public API is GraphQL on NestJS. Do not rebuild the complete REST surface in NestJS as a prerequisite. Extract transport-neutral domain services, expose them through GraphQL, and retain the legacy Express routes until each consumer scenario has passed a semantic cutover gate. A temporary NestJS REST adapter is appropriate only when a specific client cannot move with its GraphQL operation.

Parity means the same authorization decisions, domain state transitions, side effects, and user-visible outcomes. It does not mean forcing GraphQL responses and errors to imitate REST envelopes byte-for-byte.

## Verified baseline

The reproducible source inventory is [generated/rest-surface.md](generated/rest-surface.md). Run `npm run api:surface` after changing Express routes and `npm run api:surface:check` in CI.

| Surface | Verified snapshot | Interpretation |
| --- | ---: | --- |
| Express route declarations | 412 | Static declarations under `backend/src`, excluding tests and comment examples |
| Unique resolved method/path operations | 407 | Includes 402 `/api` operations and 5 documentation/health/fallback routes; this is the migration ledger input, not a claim that all operations are externally reachable |
| Backend test files | 38 | Includes database safety/bootstrap, Stripe idempotency, invoice-payment, reputation-delete, Google authentication, organization-context, shared GraphQL contract, and billing-concurrency tests added during Phase 0 |
| Real-database integration suites | 16 | 300 mechanically counted `test`/`it` declarations; concurrent Stripe, invoice-number, and estimate-conversion scenarios await a Docker/PostgreSQL run |
| All backend test cases | 438 | Includes expanded table-driven cases; database-backed cases still require the fresh PostgreSQL runner |
| Frontend test files | 6 | Mostly utilities/configuration; no broad API consumer or browser cutover suite |
| Direct `{ error: ... }` JSON response sites | 300 | Evidence of an error-contract normalization problem, not necessarily 300 distinct shapes |

The 16 database integration suites cover bookings, calendars, campaigns, contacts, email templates, estimates, forms, invoice actions, invoices, lists, notes, organizations, pipelines, Stripe webhook concurrency, tags, and workflows. Several suites include cross-organization denial scenarios, so tenancy is not wholly untested. Coverage is still far smaller than the 402-operation `/api` surface and is concentrated in selected domains.

The former claim of 8 suites and 73 tests was stale. No current full database-suite pass is asserted here because Docker/PostgreSQL was unavailable in the implementation workspace; the new fresh-database command is the required verification path.

## Phase 0 work now in place

1. **Database blast-radius guard.** Integration tests require `TEST_DATABASE_URL`; they never fall back to `DATABASE_URL`, reject an identical URL, and reject ambiguously named databases unless isolation is explicitly acknowledged. Configuration starts from `backend/.env.test.example`.
2. **Reproducible REST inventory.** `scripts/generate-api-surface.js` statically resolves mounted routers without booting the app, connecting to PostgreSQL, or initializing external services. It produces JSON for tooling and Markdown for review.
3. **Drift checks.** `npm run api:surface:check` fails when the committed baseline is stale. `npm --prefix backend run test:integration:config` verifies the database guard without opening a database connection.
4. **Fresh database runner.** `npm run test:integration:fresh` in `backend/` creates PostgreSQL 16 with Docker, resets the guarded schema, uses the real application initializer, verifies 87 expected tables and 40 migration markers, runs the integration suites, and destroys the database. See [Disposable integration database](../Tests/integration-database.md).
5. **Strict grouped migrations.** A grouped migration that reports internal failures is no longer recorded as successful.
6. **Stripe webhook idempotency.** Invoice webhook processing now claims a unique Stripe event inside the same transaction as payment/invoice mutations, serializes by payment reference, rejects a previously recorded payment reference, locks the invoice row, and rolls back the claim on failure. Both the application initializer and numbered production migration stream create the event table; production startup requires migration `006_stripe_webhook_idempotency`.
7. **REST-to-GraphQL cutover ledger.** `npm run api:ledger` correlates all 407 registered operations (402 under `/api`) with 387 static frontend callsites and backend test references, recommends initial transports, assigns evidence-based risk, and exposes review queues. Human decisions and acknowledged dynamic helpers live in `graphql-operation-overrides.json`; see [GraphQL cutover ledger workflow](graphql-cutover-ledger-workflow.md).
8. **Frontend-route reconciliation.** All 18 previously unmatched frontend calls are resolved: incorrect public booking/form and search paths were fixed, missing invoice-payment and reputation-delete handlers were implemented, onboarding reset was made statically traceable, and unused legacy API wrappers were removed. The ledger now has zero unmatched calls and zero unreviewed runtime expressions.
9. **Authentication slice assignment and contract.** All 14 auth operations have owners, target `AuthModule` operations or retained-HTTP decisions, and parity states. The [authentication cutover contract](contracts/auth-graphql-cutover.md) freezes cookies, CSRF, identity, tenancy context, errors, transaction boundaries, and required scenarios. The active Google flow now validates provider tokens server-side instead of trusting browser-supplied identity fields.
10. **Tenancy context and organization slice.** All 11 organization operations are assigned to `OrganizationsModule`, and the [tenancy contract](contracts/tenancy-graphql-context.md) freezes request-context selection, the role matrix, error semantics, transaction boundaries, and row-level SQL requirements. Direct middleware tests cover explicit/default membership, outsider and role denial, invalid IDs, missing auth, optional context, and connection cleanup.
11. **Shared GraphQL transport contract.** The [shared contract](contracts/graphql-shared-contracts.md) freezes stable error codes, strict page-based pagination, scalar transport rules, nullability, and mutation-result conventions. Framework-neutral helpers and 20 tests prove normalization, internal-error redaction, page metadata, and precision-preserving decimal serialization.
12. **Invoicing slice assignment and contract.** All 46 invoice operations are assigned across eight billing modules with named GraphQL targets, retained-HTTP exceptions, risk, and parity status. The [invoicing contract](contracts/invoices-graphql-cutover.md) freezes decimal and currency boundaries, numbering, state transitions, transaction/locking rules, side-effect retry behavior, and the required parity matrix.
13. **Billing concurrency primitives.** Direct invoice creation, estimate conversion, manual recurring generation, and scheduled recurring generation now share an atomic PostgreSQL invoice-number allocator. Estimate numbering takes an organization-scoped transaction advisory lock; conversion locks its source; recurring routes lock tenant-owned templates; and background runners claim due templates with `FOR UPDATE ... SKIP LOCKED`. Seven focused tests protect these query and transaction contracts. Concurrent direct-create and estimate-conversion scenarios are also present in the real-PostgreSQL suite and await the disposable database runner.

## P0 implementations awaiting PostgreSQL verification

### 1. Reproducible disposable database provisioning

The fresh runner and schema contract are implemented. They could not be executed in the implementation workspace because neither Docker nor `psql` was installed.

**Gate:** run `npm run test:integration:fresh` successfully in CI and a developer environment. No shared long-lived database is used.

### 2. Stripe invoice webhook idempotency

The legacy handler now has transactional event claims and payment-reference deduplication, with unit/route tests for duplicate delivery, duplicate payment references, commit, and rollback.

**Gate:** run the included concurrent-delivery integration scenario against fresh PostgreSQL. Preserve this behavior as the NestJS semantic contract.

## Remaining P0 blockers

### 3. REST operation to GraphQL operation ledger

The generated ledger now supplies an initial disposition and evidence for every REST operation, and its unmatched frontend queue is empty. Human decisions now cover the first 71 authentication, organization, and invoicing operations. Owners still need to approve the recommendations and name targets for the remaining domains.

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

Authentication, tenancy, shared error/pagination/scalar rules, and invoicing are now documented in dedicated contracts. Before implementing the remaining slices, document and test the observable behavior of:

- field-specific ordering, filtering, search, and null semantics not covered by the shared transport rules
- upload/download limits, content types, signed URLs, and authorization outside the characterized invoice paths
- non-invoice webhook verification, replay handling, retry behavior, and transaction boundaries
- Socket.IO event names, room rules, payloads, authorization, and reconnect behavior

The Socket.IO implementation has multiple join, typing, update, deletion, and viewer-count contracts but no dedicated contract suite. It remains a separate compatibility surface even if GraphQL subscriptions are introduced later.

### 5. Consumer-level verification

Six frontend test files do not establish that the React application can cut over safely. Add consumer scenarios around authentication, organization switching, CRUD, pagination, optimistic updates, uploads, billing/invoicing, and realtime updates. At least the critical paths need browser-level smoke tests against the GraphQL stack.

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

1. Run the disposable database bootstrap and all 16 integration suites in Docker/CI.
2. Confirm the real-PostgreSQL concurrent-delivery test for Stripe webhook idempotency passes.
3. Continue assigning owners and GraphQL targets after the 71 authentication, organization, and invoicing operations already decided, prioritizing frontend-consumed high-risk operations.
4. Freeze the remaining field-specific query, upload, non-invoice webhook, and Socket.IO contracts; keep the shared, authentication, tenancy, and invoicing contracts current as characterization expands.
5. Define the GraphQL schema and NestJS module boundaries around domain behavior, not legacy route-file boundaries.
6. Extract or reimplement transport-neutral services and add PostgreSQL integration tests.
7. Migrate vertical slices: GraphQL operation, consumer change, semantic parity, observability, then retire the corresponding REST consumer path.
8. Cut over only after critical browser journeys and rollback behavior pass in a production-like environment.

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
