# Itemize GraphQL API

This is the NestJS GraphQL and worker runtime used in the staged Express-to-NestJS cutover. The retained Express service remains the public same-origin ingress and proxies `POST /graphql` here. Both runtimes share PostgreSQL; Express still owns numbered migrations, rollback routing, and retained protocol endpoints unless a cutover contract says otherwise.

The first foundation slice provides:

- a public `readiness` query;
- access-cookie verification using the existing `itemize_auth` JWT;
- organization selection from `x-organization-id` or the user's database default;
- current membership and role verification on every scoped request;
- request-local identity and organization context using `AsyncLocalStorage`;
- tenant-scoped `contacts` and `contact` queries with strict filters, sorting, pagination, and tenant-private detail lookup.

Copy `.env.example` to `.env`, use the same `JWT_SECRET` and `DATABASE_URL` as the legacy backend, and set `FRONTEND_URL` to the browser origin. Use `EXTRA_CORS_ORIGINS` for explicit staging origins. The example is a checked inventory of direct runtime environment reads; `npm run config:check --workspace itemize-graphql-api` detects drift. Then run from the repository root:

```powershell
npm run dev:graphql
```

The service listens on `http://localhost:3100/graphql` by default. Run its focused test suite with `npm run test:graphql`.

Workflow execution is exposed as four explicit, bounded one-shot commands. Continuous Nest scheduling remains default-off behind `WORKFLOW_NEST_SCHEDULER_ENABLED`:

```powershell
npm run jobs:workflow-schedules --workspace itemize-graphql-api
npm run jobs:workflow-triggers --workspace itemize-graphql-api
npm run jobs:workflow-enrollments --workspace itemize-graphql-api
npm run jobs:workflow-side-effects --workspace itemize-graphql-api
```

The provider command consumes immutable outbox snapshots, uses stable delivery keys, quarantines ambiguous SMS outcomes, and applies controlled outbound-webhook egress. Worker ownership transfers independently from request traffic; follow [the runtime and worker ownership matrix](../!docs/Deploy/runtime-and-worker-ownership.md) and disable a legacy owner before enabling its Nest peer.

The repository's `backend/npm run test:integration:fresh` command runs the retained and Nest integration suites against the same freshly initialized disposable PostgreSQL database. Use `--nestjs-only <Jest path pattern>` or `--legacy-only <Jest path pattern>` after `--` for a bounded clean-schema rerun of one runtime.
