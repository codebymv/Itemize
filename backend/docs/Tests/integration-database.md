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

On 2026-07-17 the one-command run rebuilt the database, verified 94 expected tables and 65 top-level migration markers, passed all 27 legacy suites and 462 tests, then passed 3 NestJS GraphQL suites with 30 additional tests. Four GraphQL context cases prove default membership, current-role re-read, outsider denial, and immediate denial after membership deletion. Twenty contact cases cover live REST/GraphQL parity for list membership/order/pagination, search/status/tag/assignee filters, detail projection, cross-tenant privacy, invalid identifiers, suppression of user projections from corrupt cross-tenant references, mutation CSRF, canonical email normalization with legal concurrent duplicate creation, durable create side effects, concurrent plan-limit enforcement, assignee membership, omitted-versus-null updates, changed-field trigger idempotence, tenant-private mutation misses, exact deletion, bounded bulk changes, activity reads/writes, related content, and aggregate profile composition. Six tag/pipeline cases prove canonical counts and suggestions, projection-preserving rename/delete, duplicate/color/CSRF/tenant denial, board projection and aggregate parity, normalized stage writes, explicit nullable-description clearing, concurrent default serialization, in-use stage protection, and tenant-private deletion behavior.

The legacy coverage includes canonical contact-email migration repair and direct/API normalization, legal duplicate and email-less contacts, both CSV duplicate modes, deterministic public-form/booking resolution, and deduplicated campaign recipients; globally unique public-form identity with ambiguous legacy denial, typed/conditional validation, request bounds, redirect safety, tenant/object constraints, durable trigger/notification enqueue and delivery, and replay-safe migration repair; canonical tag drift repair, array/junction projection and tenant denial; canonical pipeline-stage drift repair, JSON/row projection, deal tenant/stage constraints, in-use protection, and default uniqueness; live Socket.IO authorization; analytics tenant/window/bucket/numeric semantics; invoicing and Stripe concurrency; aggregate-profile tenancy; CSV transfer boundaries; CRM races/reference integrity; booking collisions and cancellation replay; audience calculation/campaign snapshots; signature integrity; public-sharing capability lifecycle; transactional workflow events; one-shot scheduling, leased trigger fan-out, enrollment fencing/lifecycle, provider delivery/reconciliation, staging canary/drain behavior, and operator visibility; replay-safe Twilio, Resend, Meta, and Stripe provider events with leased reconciliation and retry/dead-letter behavior.

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
