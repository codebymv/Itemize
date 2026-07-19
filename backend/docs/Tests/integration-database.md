# Disposable integration database

Backend integration tests must run against a disposable PostgreSQL database. They never fall back to the application `DATABASE_URL`.

## One-command Docker run

From `backend/`:

```powershell
npm run test:integration:fresh
```

This command:

1. starts PostgreSQL 16 from `docker-compose.integration.yml`
2. drops and rebuilds only the guarded `itemize_integration` schema
3. runs the application’s real schema initializer
4. verifies every statically declared table and top-level migration marker
5. clears inherited email, SMS, storage, payment, monitoring, OAuth-secret, and AI-provider credentials
6. runs all legacy and NestJS GraphQL database integration suites serially
7. destroys the PostgreSQL container and data even when tests fail

Docker must provide the modern `docker compose` command. Set `ITEMIZE_TEST_DB_PORT` if local port `55432` is already occupied.

## Verified baseline

The latest 2026-07-19 run verified 97 expected tables and 71 top-level migration markers, passed all 28 legacy suites with 484 tests, and then passed all 10 NestJS GraphQL suites with 94 tests.

On 2026-07-18 the one-command run rebuilt the database, verified 96 expected tables and 69 top-level migration markers, passed all 28 legacy suites and 475 tests, then passed 7 NestJS GraphQL suites with 67 additional tests. Eight live Socket.IO cases include committed-outbox delivery, two-client public-room revocation, and end-session HTTP commit with active-visitor eviction, rejoin denial, post-end visitor/agent write denial, and transcript reads that preserve offline state. Six dedicated outbox cases prove transaction rollback, identical replay and conflicting key reuse, competing claims, transient retry, redacted dead-lettering, and expired-lease recovery. Four GraphQL context cases prove current membership enforcement, contact cases cover contact/profile parity, and tag/pipeline cases prove canonical vocabulary behavior. Authenticated-form cases prove list/detail/field/count parity, default-field creation, serialized plan enforcement, omitted-versus-null settings, CSRF and tenant privacy, atomic conditional-field remapping, publish validation, duplication with fresh IDs, deterministic submission paging, and tenant-private form/submission deletion. Four onboarding cases prove empty/default reads, typed lifecycle mutations, atomic durable events, concurrent feature updates, user isolation, validation, and CSRF. Five category cases prove the characterized REST rollback path, new-user General seeding, user isolation, validation, CSRF, duplicate handling, transactional five-store rename/delete propagation, and General protection. Fifteen workspace-content cases prove user-scoped list/note/whiteboard reads, strict paging and search, category identity repair without trusting stale foreign IDs, all four legacy REST read rollback paths, conditional ETag replays that still return complete private `200` bodies, list/note/whiteboard create/update/delete parity, stale list and whiteboard conflict rejection, CSRF, concurrent partial-update composition, tenant-private misses, atomic owner/shared outbox enqueue, bounded whiteboard refetch projection, and delivery through the legacy socket worker. Anonymous form retrieval and submission remain covered by the retained HTTP suite.

The legacy coverage includes canonical contact-email migration repair and direct/API normalization, legal duplicate and email-less contacts, both CSV duplicate modes, deterministic public-form/booking resolution, and deduplicated campaign recipients; globally unique public-form identity with ambiguous legacy denial, typed/conditional validation, request bounds, redirect safety, tenant/object constraints, durable trigger/notification enqueue and delivery, and replay-safe migration repair; globally unique public-calendar identity with ambiguous legacy denial, one-time hash-only cancellation capabilities, expiry, lifecycle revocation, and replay-safe legacy-token repair; canonical tag drift repair, array/junction projection and tenant denial; canonical pipeline-stage drift repair, JSON/row projection, deal tenant/stage constraints, in-use protection, and default uniqueness; live Socket.IO authorization and public-room revocation; analytics tenant/window/bucket/numeric semantics; invoicing and Stripe concurrency; aggregate-profile tenancy; CSV transfer boundaries; CRM races/reference integrity; booking collisions and cancellation replay; audience calculation/campaign snapshots; signature integrity; public-sharing capability lifecycle; transactional workflow events; one-shot scheduling, leased trigger fan-out, enrollment fencing/lifecycle, provider delivery/reconciliation, staging canary/drain behavior, and operator visibility; replay-safe Twilio, Resend, Meta, and Stripe provider events with leased reconciliation and retry/dead-letter behavior.

The browser transport gate is intentionally separate from the database suite. From `backend/`, `npm run test:browser:shared-realtime` starts disposable local HTTP/Socket.IO and Vite servers and runs four real-Chromium shared-list scenarios: reconnect with authoritative refetch before queued updates, failed-refetch static fallback, live deletion, and capability rotation. It uses no provider credentials, persistent database, Railway service, or production resource.

The fresh runner deliberately ignores provider credentials inherited from the developer's shell. Provider contract tests must use mocks, fakes, or dedicated sandbox harnesses; a disposable database run must never send real email/SMS, upload objects, charge Stripe, report to Sentry, or invoke paid AI APIs.

## Existing disposable PostgreSQL

Copy `backend/.env.test.example` to `backend/.env.test`, then set `TEST_DATABASE_URL`. The URL must differ from `DATABASE_URL` and identify an obviously test/CI/integration database. For managed systems whose hostname and database name are generic, use the exact isolation acknowledgment documented in the example only after verifying the database is disposable.

From `backend/`:

```powershell
npm run db:test:reset
npm run test:integration
```

`db:test:reset` is destructive. It drops the `public` schema at `TEST_DATABASE_URL`, recreates it, runs the application initializer, and verifies the result. `npm run db:test:verify` performs initialization/verification without dropping the schema.

## What is verified

- `TEST_DATABASE_URL` exists, is PostgreSQL, and is not `DATABASE_URL`
- destructive reset has explicit command-line confirmation
- grouped migrations that report failures are not recorded as successful
- application startup stops when any required migration reports failure
- every table statically declared by `db.js` and `db*_migrations.js` exists
- every top-level `runMigrationOnce` marker in `db.js` exists
- integration suites use the same guarded pool configuration

Table and migration-marker verification catches partial initializations. The integration suites remain responsible for constraints, columns, transactions, and domain behavior.
