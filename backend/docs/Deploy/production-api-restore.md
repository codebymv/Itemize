# Production API restore (hollow Express)

Observed 18 Aug 2026 against `https://itemize-backend-production-92ad.up.railway.app`:

- `GET /api/health` returned `status: "healthy"` with a live database (uptime ~8.5 days).
- `GET /api/signatures/documents/1/file` and `GET /api/status` returned `API_INITIALIZATION_FAILED`.
- `GET /graphql` returned `405 Method Not Allowed` (proxy mounted; POST-only).

That combination means deferred init obtained a Postgres pool, then threw **before** `registerApiRoutes` finished. `/api/health` is registered before that work, so Railway kept the process.

## Restore

1. Railway logs for `itemize-backend-production-92ad`: search `Database-dependent API initialization failed`. The `error` field is the cause.
2. Typical causes:
   - `schema_migrations` missing, or required marker not recorded. Current boot requires `054_vault_zero_knowledge`.
   - Invalid `GRAPHQL_UPSTREAM_URL` thrown while creating HTTP proxies.
3. Run `node backend/scripts/run-migrations.js --status` then `node backend/scripts/run-migrations.js` against production Postgres.
4. Confirm `GRAPHQL_UPSTREAM_URL` is the private Nest origin (`http`/`https`, no credentials).
5. Redeploy the Express service. After this boot hardening, a failed init **exits 1** and `/api/health` is **503** after the startup grace window.
6. Confirm `GET /api/health` is healthy, then an authenticated `GET /api/signatures/documents/:id/file` returns `application/pdf`.
