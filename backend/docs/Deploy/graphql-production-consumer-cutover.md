# GraphQL production consumer cutover

**Status:** 76 domain consumers plus authentication session, identity lifecycle, and password recovery enabled

**Cutover date:** 2026-07-21

## Production topology

The browser uses the production `VITE_API_URL` (`https://itemize-backend-production-92ad.up.railway.app`) for REST and `/graphql`. That backend forwards GraphQL to `itemize.cloud GraphQL Production` over Railway's private network. The proxy has an explicit response allowlist for the three authentication cookies and cache/CSRF headers, allowing NestJS to own browser sessions through the existing API origin. The frontend custom domain itself serves the SPA shell and is not the direct `/graphql` endpoint.

The 76 domain switches referenced by `frontend/src/services/graphqlClient.ts` are enabled in production. `VITE_AUTH_SESSION_GRAPHQL`, `VITE_AUTH_IDENTITY_GRAPHQL`, and `VITE_AUTH_RECOVERY_GRAPHQL` independently control the enabled session, registration/verification, and forgot/reset-password protocols. A frontend rebuild is required because Vite embeds these values at build time.

The enabled families are:

- contacts, pipelines, deals, forms, onboarding, categories, and organization selection;
- calendars, calendar integration management, and authenticated bookings;
- products, invoice businesses/settings/invoices, estimates, recurring invoices, and payments;
- workspace lists, notes, and whiteboards;
- dashboard and aggregate analytics;
- audience segments, email/SMS templates, campaigns, workflows, enrollments, workflow execution visibility, reputation reviews, and reputation analytics.

## Intentionally retained transports

Enabling every implemented GraphQL consumer does not turn non-GraphQL protocols into GraphQL. Unused OAuth callbacks, public booking/form/signing capabilities, provider webhooks, CSV/file/PDF HTTP responses, and Socket.IO realtime delivery remain on their documented HTTP or socket boundaries. Authenticated password/profile mutations exist in GraphQL but have no retained frontend callsite to replace. Where an HTTP route is already owned by NestJS, the legacy backend may continue to act as the same-origin private proxy.

## Verification

Before the bulk switch, all 73 client keys matched the frontend environment schema, the focused environment/onboarding/category/GraphQL-client tests passed, the complete NestJS suite passed 301 tests, and the production GraphQL schema was healthy behind the same-origin proxy. Production had no users or meaningful application data, so the implemented consumer set was enabled in one build rather than as a user canary.

The authentication cutover completed on 2026-07-21 with backend deployment `5d155af6-e84b-4a8a-a385-2867a01f8fc2`, GraphQL deployment `62755717-ecb6-4249-8ee7-748f229d620b`, and flag-enabled frontend deployment `75a3b29a-3870-492a-b99e-d6f0c5cd9475`, all from commit `9f3a4c86`. Production probes proved `csrfToken` returns `Cache-Control: no-store` and only the CSRF cookie, anonymous `currentUser` fails with `UNAUTHENTICATED`, and invalid login fails with `reason=INVALID_CREDENTIALS` without issuing an auth cookie. An isolated browser submission rendered the retained invalid-credentials UX while the backend recorded browser-originated `operationName="Login"` on `POST /graphql`.

The identity-lifecycle cutover completed from commit `44281ad3` with backend deployment `1fc4a8c1-7a73-4459-8868-d6826bd4ac99`, GraphQL deployment `7c9b6fc2-2af6-474b-be47-9ec1052a40f3`, and flag-enabled frontend deployment `0186d765-2661-49a6-9d77-f4c7e01e889e`. Non-mutating production probes verified malformed registration, unknown verification token, and non-enumerating missing-account resend. A browser load of an invalid verification link rendered the expected error while NestJS recorded `operationName="VerifyEmail"` with `INVALID_TOKEN`.

The password-recovery cutover completed from commit `28d0b0af` with backend deployment `eccd0bb5-02f7-4799-80e9-a9a47a776033`, GraphQL deployment `2037928f-a948-48ca-9828-a3735d28eca1`, and flag-enabled frontend deployment `83913ee7-6566-4820-b181-033ebaa9dd12`. Safe probes verified validation, generic missing-account behavior, invalid reset-token rejection, and authenticated-only profile access. A deployed forgot-password submission used GraphQL and rendered the generic success state without creating data or invoking the email provider.

The audience-segment cutover completed from commit `b0c618da` with backend deployment `f59a065e-51c7-43ee-8e17-943104d5f850`, GraphQL deployment `acb51cd1-f3e2-45c1-a011-18e6eeec611e`, and flag-enabled frontend deployment `81b86fd7-270d-414d-8162-9133df0e737a`. Read-only production probes validated all nine schema fields without mutation, confirmed `VITE_SEGMENTS_GRAPHQL=true`, and returned healthy site, API, and GraphQL responses. The existing authenticated browser session then loaded `/segments` and rendered the authoritative empty state and zero counts without an error or abandoned loader.

The reputation-review cutover completed from commit `6749ff27` with backend deployment `2f404c99-9a5e-4b46-9603-632a3f045a2a`, GraphQL deployment `4b297d81-7a5e-4af0-be02-505da701786d`, and flag-enabled frontend deployment `8b2b8b94-8d85-4c93-a55e-98f2b693ea2e`. Safe query and mutation probes proved the production schema and auth guard through the public proxy, `VITE_REPUTATION_REVIEWS_GRAPHQL=true` was confirmed from Railway, and an authenticated `/reviews` navigation rendered the authoritative empty state without a client or server error.

The reputation-analytics cutover completed from commit `4e9d63b4` with backend deployment `9723ae05-204f-493a-89f0-203c666f4e57`, GraphQL deployment `df732fda-7157-4a73-9c86-e3bcfa56dcb3`, and flag-enabled frontend deployment `c7fb43f1-2d5b-4f68-b473-fbe462ed87e9`. The public proxy recognized the complete query and auth guard, Railway confirmed `VITE_REPUTATION_ANALYTICS_GRAPHQL=true`, and an authenticated `/reviews` reload rendered all five metric cards plus the empty state. Nest logs paired that browser navigation with successful, zero-error `ReputationReviews` and `ReputationAnalytics` operations, so the active Reviews page has no retained REST application-data request.

After deployment, verify:

1. `https://itemize.cloud` returns HTTP `200`;
2. production `/api/health` returns HTTP `200`;
3. a proxied GraphQL `__typename` query returns HTTP `200`;
4. all 76 domain `VITE_*_GRAPHQL` variables plus `VITE_AUTH_SESSION_GRAPHQL`, `VITE_AUTH_IDENTITY_GRAPHQL`, and `VITE_AUTH_RECOVERY_GRAPHQL` are `true`;
5. the frontend and backend deployments resolve to the Git commit containing this document;
6. GraphQL logs contain no internal-error spike after the frontend replacement.

## Rollback

Consumer rollback is data-neutral. Set only the affected domain variables to `false` and rebuild the frontend; the retained REST adapters read the same PostgreSQL rows. Authentication session rolls back as one unit with `VITE_AUTH_SESSION_GRAPHQL=false`; registration/verification/resend use `VITE_AUTH_IDENTITY_GRAPHQL=false`; forgot/reset password use `VITE_AUTH_RECOVERY_GRAPHQL=false`. Rebuild after any change, and do not split the coordinated session operations. Scheduler rollback is separate and must follow the mutually exclusive ownership procedure in [workflow-rollout-runbook.md](workflow-rollout-runbook.md).
