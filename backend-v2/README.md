# Itemize GraphQL API

This is the side-by-side NestJS service for the GraphQL cutover. It does not replace, proxy, or receive traffic from the legacy Express API yet.

The first foundation slice provides:

- a public `readiness` query;
- access-cookie verification using the existing `itemize_auth` JWT;
- organization selection from `x-organization-id` or the user's database default;
- current membership and role verification on every scoped request;
- request-local identity and organization context using `AsyncLocalStorage`;
- tenant-scoped `contacts` and `contact` queries with strict filters, sorting, pagination, and tenant-private detail lookup.

Copy `.env.example` to `.env`, use the same `JWT_SECRET` and `DATABASE_URL` as the legacy backend, and set `FRONTEND_URL` to the browser origin. Use `EXTRA_CORS_ORIGINS` for explicit staging origins. Then run from the repository root:

```powershell
npm run dev:graphql
```

The service listens on `http://localhost:3100/graphql` by default. Run its focused test suite with `npm run test:graphql`.

Workflow execution is exposed as four explicit, bounded one-shot commands and is not scheduled by this service yet:

```powershell
npm run jobs:workflow-schedules --workspace itemize-graphql-api
npm run jobs:workflow-triggers --workspace itemize-graphql-api
npm run jobs:workflow-enrollments --workspace itemize-graphql-api
npm run jobs:workflow-side-effects --workspace itemize-graphql-api
```

The provider command consumes immutable outbox snapshots, uses stable delivery keys, quarantines ambiguous SMS outcomes, and applies controlled outbound-webhook egress. Production scheduler and deployment flags remain on the retained backend until the final operational cutover.

The repository's `backend/npm run test:integration:fresh` command also runs the GraphQL context and dual REST/GraphQL contact parity operations against the same freshly initialized disposable PostgreSQL database after the legacy integration suites pass.
