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

On 2026-07-16 the one-command run rebuilt the database, verified 94 expected tables and 61 top-level migration markers, passed all 27 legacy suites and 436 tests, then passed 2 NestJS GraphQL suites with 10 additional tests. Four GraphQL context cases prove default membership, current-role re-read, outsider denial, and immediate denial after membership deletion. Six contact cases cover live REST/GraphQL parity for list membership/order/pagination, search/status/tag/assignee filters, detail projection, cross-tenant privacy, invalid identifiers, and suppression of user projections from corrupt cross-tenant references. The legacy coverage includes live Socket.IO authorization, analytics tenant/window/bucket/numeric semantics, concurrent invoice-number allocation, estimate conversion, Stripe invoice and subscription webhook deduplication, simultaneous manual invoice payments, aggregate-profile tenancy, CSV transfer boundaries, CRM races/reference integrity, simultaneous booking collision prevention, public cancellation replay, serialized audience calculations, saved-segment campaign recipient snapshots, concurrent signature send exclusion, atomic signature cancellation/revocation, linked-contact contract-completion events, public-sharing capability issuance/rotation/revocation, nested shared-content sanitization, canonical workflow alias normalization, transactional contact/tag/invoice/contract/booking/form/deal workflow events, exactly-once one-shot schedule dispatch across competing workers, leased trigger fan-out, an ordered enabled contact-to-provider workflow cycle with no-op replay, a staging-guarded canary that claims only its own IDs and retires its fixtures, durable enrollment-step attempt fencing and stale-worker rejection, manual and deactivation pause separation, same-step failed-enrollment retry, cancellation across queued and in-flight workflow provider work, dead-letter operator retry history, tenant-isolated workflow execution summaries and payload-free filtered queue projections, pre-upgrade webhook replay compatibility, leased workflow provider delivery with retry and expired-lease recovery, immediate ambiguous Twilio failure quarantine with no automatic resend, accepted-SID reconciliation and explicit resend authorization, provider-unavailable messaging semantics, replay-safe Twilio callbacks with organization-owned receiving-number routing, signed replay-safe out-of-order Resend delivery events, leased Resend pending-event recovery and cross-tenant ambiguity quarantine, exact-body signed Meta batch claims, bounded overflow processing, leased unmatched/ambiguous reconciliation, deterministic same-second Stripe subscription ordering, leased Stripe tenant reconciliation, and concurrent upgrade-notification delivery with retry/dead-letter behavior.

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
