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
5. runs all database integration suites serially
6. destroys the PostgreSQL container and data even when tests fail

Docker must provide the modern `docker compose` command. Set `ITEMIZE_TEST_DB_PORT` if local port `55432` is already occupied.

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
- every table statically declared by `db.js` and `db*_migrations.js` exists
- every top-level `runMigrationOnce` marker in `db.js` exists
- integration suites use the same guarded pool configuration

Table and migration-marker verification catches partial initializations. The integration suites remain responsible for constraints, columns, transactions, and domain behavior.
