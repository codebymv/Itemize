# Itemize GraphQL API

This is the side-by-side NestJS service for the GraphQL cutover. It does not replace, proxy, or receive traffic from the legacy Express API yet.

The first foundation slice provides:

- a public `readiness` query;
- access-cookie verification using the existing `itemize_auth` JWT;
- organization selection from `x-organization-id` or the user's database default;
- current membership and role verification on every scoped request;
- request-local identity and organization context using `AsyncLocalStorage`.

Copy `.env.example` to `.env`, use the same `JWT_SECRET` and `DATABASE_URL` as the legacy backend, then run from the repository root:

```powershell
npm run dev:graphql
```

The service listens on `http://localhost:3100/graphql` by default. Run its focused test suite with `npm run test:graphql`.

The repository's `backend/npm run test:integration:fresh` command also runs the GraphQL context operations against the same freshly initialized disposable PostgreSQL database after the legacy integration suites pass.
