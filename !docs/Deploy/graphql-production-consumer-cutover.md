# GraphQL production consumer cutover

**Status:** 73 domain consumers plus authentication session and identity lifecycle enabled; password recovery staged default-off

**Cutover date:** 2026-07-21

## Production topology

The browser uses the production `VITE_API_URL` (`https://itemize-backend-production-92ad.up.railway.app`) for REST and `/graphql`. That backend forwards GraphQL to `itemize.cloud GraphQL Production` over Railway's private network. The proxy has an explicit response allowlist for the three authentication cookies and cache/CSRF headers, allowing NestJS to own browser sessions through the existing API origin. The frontend custom domain itself serves the SPA shell and is not the direct `/graphql` endpoint.

The 73 domain switches referenced by `frontend/src/services/graphqlClient.ts` are enabled in production. `VITE_AUTH_SESSION_GRAPHQL` and `VITE_AUTH_IDENTITY_GRAPHQL` independently control the enabled session and registration/verification protocols. `VITE_AUTH_RECOVERY_GRAPHQL` controls forgot/reset password and remains default-off until the staged GraphQL deployment and production probes pass. A frontend rebuild is required because Vite embeds these values at build time.

The enabled families are:

- contacts, pipelines, deals, forms, onboarding, categories, and organization selection;
- calendars, calendar integration management, and authenticated bookings;
- products, invoice businesses/settings/invoices, estimates, recurring invoices, and payments;
- workspace lists, notes, and whiteboards;
- dashboard and aggregate analytics;
- email/SMS templates, campaigns, workflows, enrollments, and workflow execution visibility.

## Intentionally retained transports

Enabling every implemented GraphQL consumer does not turn non-GraphQL protocols into GraphQL. Unused OAuth callbacks, public booking/form/signing capabilities, provider webhooks, CSV/file/PDF HTTP responses, and Socket.IO realtime delivery remain on their documented HTTP or socket boundaries. Authenticated password/profile mutations exist in GraphQL but have no retained frontend callsite to replace. Where an HTTP route is already owned by NestJS, the legacy backend may continue to act as the same-origin private proxy.

## Verification

Before the bulk switch, all 73 client keys matched the frontend environment schema, the focused environment/onboarding/category/GraphQL-client tests passed, the complete NestJS suite passed 301 tests, and the production GraphQL schema was healthy behind the same-origin proxy. Production had no users or meaningful application data, so the implemented consumer set was enabled in one build rather than as a user canary.

The authentication cutover completed on 2026-07-21 with backend deployment `5d155af6-e84b-4a8a-a385-2867a01f8fc2`, GraphQL deployment `62755717-ecb6-4249-8ee7-748f229d620b`, and flag-enabled frontend deployment `75a3b29a-3870-492a-b99e-d6f0c5cd9475`, all from commit `9f3a4c86`. Production probes proved `csrfToken` returns `Cache-Control: no-store` and only the CSRF cookie, anonymous `currentUser` fails with `UNAUTHENTICATED`, and invalid login fails with `reason=INVALID_CREDENTIALS` without issuing an auth cookie. An isolated browser submission rendered the retained invalid-credentials UX while the backend recorded browser-originated `operationName="Login"` on `POST /graphql`.

The identity-lifecycle cutover completed from commit `44281ad3` with backend deployment `1fc4a8c1-7a73-4459-8868-d6826bd4ac99`, GraphQL deployment `7c9b6fc2-2af6-474b-be47-9ec1052a40f3`, and flag-enabled frontend deployment `0186d765-2661-49a6-9d77-f4c7e01e889e`. Non-mutating production probes verified malformed registration, unknown verification token, and non-enumerating missing-account resend. A browser load of an invalid verification link rendered the expected error while NestJS recorded `operationName="VerifyEmail"` with `INVALID_TOKEN`.

After deployment, verify:

1. `https://itemize.cloud` returns HTTP `200`;
2. production `/api/health` returns HTTP `200`;
3. a proxied GraphQL `__typename` query returns HTTP `200`;
4. all 73 domain `VITE_*_GRAPHQL` variables plus `VITE_AUTH_SESSION_GRAPHQL` and `VITE_AUTH_IDENTITY_GRAPHQL` are `true`;
5. the frontend and backend deployments resolve to the Git commit containing this document;
6. GraphQL logs contain no internal-error spike after the frontend replacement.

## Rollback

Consumer rollback is data-neutral. Set only the affected domain variables to `false` and rebuild the frontend; the retained REST adapters read the same PostgreSQL rows. Authentication session rolls back as one unit by setting `VITE_AUTH_SESSION_GRAPHQL=false`; registration/verification/resend roll back independently with `VITE_AUTH_IDENTITY_GRAPHQL=false`. Rebuild after either change, and do not split the coordinated session operations during rollback. Scheduler rollback is separate and must follow the mutually exclusive ownership procedure in [workflow-rollout-runbook.md](workflow-rollout-runbook.md).
