# GraphQL production consumer cutover

**Status:** All implemented browser GraphQL consumers enabled in production

**Cutover date:** 2026-07-21

## Production topology

The browser continues to use the public `itemize.cloud Backend` origin for authentication, REST, and `/graphql`. The backend forwards GraphQL to `itemize.cloud GraphQL Production` over Railway's private network. This preserves the host-bound authentication cookie and existing CSRF contract while NestJS owns the GraphQL schema.

The authoritative browser switch inventory is every `VITE_*_GRAPHQL` key referenced by `frontend/src/services/graphqlClient.ts`. The centralized schema in `frontend/src/config/env.ts` contains the same 73 keys. Production sets all 73 to `true`; a frontend rebuild is required because Vite embeds them at build time.

The enabled families are:

- contacts, pipelines, deals, forms, onboarding, categories, and organization selection;
- calendars, calendar integration management, and authenticated bookings;
- products, invoice businesses/settings/invoices, estimates, recurring invoices, and payments;
- workspace lists, notes, and whiteboards;
- dashboard and aggregate analytics;
- email/SMS templates, campaigns, workflows, enrollments, and workflow execution visibility.

## Intentionally retained transports

Enabling every implemented GraphQL consumer does not turn non-GraphQL protocols into GraphQL. Authentication and OAuth callbacks, public booking/form/signing capabilities, provider webhooks, CSV/file/PDF HTTP responses, and Socket.IO realtime delivery remain on their documented HTTP or socket boundaries. Where an HTTP route is already owned by NestJS, the legacy backend may continue to act as the same-origin private proxy.

## Verification

Before the bulk switch, all 73 client keys matched the frontend environment schema, the focused environment/onboarding/category/GraphQL-client tests passed, the complete NestJS suite passed 301 tests, and the production GraphQL schema was healthy behind the same-origin proxy. Production had no users or meaningful application data, so the implemented consumer set was enabled in one build rather than as a user canary.

After deployment, verify:

1. `https://itemize.cloud` returns HTTP `200`;
2. production `/api/health` returns HTTP `200`;
3. a proxied GraphQL `__typename` query returns HTTP `200`;
4. all 73 production `VITE_*_GRAPHQL` variables are `true`;
5. the frontend and backend deployments resolve to the Git commit containing this document;
6. GraphQL logs contain no internal-error spike after the frontend replacement.

## Rollback

Consumer rollback is data-neutral. Set only the affected `VITE_*_GRAPHQL` variables to `false` and rebuild the frontend; the retained REST adapters read the same PostgreSQL rows. Scheduler rollback is separate and must follow the mutually exclusive ownership procedure in [workflow-rollout-runbook.md](workflow-rollout-runbook.md).
