# GraphQL production consumer cutover

**Status:** 81 domain consumers plus authentication session, identity lifecycle, and password recovery enabled

**Cutover date:** 2026-07-21

## Production topology

The browser uses the production `VITE_API_URL` (`https://itemize-backend-production-92ad.up.railway.app`) for REST and `/graphql`. That backend forwards GraphQL to `itemize.cloud GraphQL Production` over Railway's private network. The proxy has an explicit response allowlist for the three authentication cookies and cache/CSRF headers, allowing NestJS to own browser sessions through the existing API origin. The frontend custom domain itself serves the SPA shell and is not the direct `/graphql` endpoint.

The 81 domain switches represented by the frontend environment contract are enabled in production. `VITE_AUTH_SESSION_GRAPHQL`, `VITE_AUTH_IDENTITY_GRAPHQL`, and `VITE_AUTH_RECOVERY_GRAPHQL` independently control the enabled session, registration/verification, and forgot/reset-password protocols. A frontend rebuild is required because Vite embeds these values at build time.

The enabled families are:

- contacts, pipelines, deals, forms, onboarding, categories, and organization selection;
- calendars, calendar integration management, and authenticated bookings;
- products, invoice businesses/settings/invoices, estimates, recurring invoices, and payments;
- workspace lists, notes, and whiteboards;
- dashboard and aggregate analytics;
- audience segments, email/SMS templates, campaigns, workflows, enrollments, workflow execution visibility, reputation reviews, reputation analytics, review-request management/delivery, and reputation platform/settings/widget configuration.

## Intentionally retained transports

Enabling every implemented GraphQL consumer does not turn non-GraphQL protocols into GraphQL. Unused OAuth callbacks, public booking/form/signing/review capabilities, provider webhooks, CSV/file/PDF HTTP responses, and Socket.IO realtime delivery remain on their documented HTTP or socket boundaries. Authenticated password/profile mutations exist in GraphQL but have no retained frontend callsite to replace. Where an HTTP route is already owned by NestJS, the legacy backend may continue to act as the same-origin private proxy.

## Verification

Before the bulk switch, all 73 client keys matched the frontend environment schema, the focused environment/onboarding/category/GraphQL-client tests passed, the complete NestJS suite passed 301 tests, and the production GraphQL schema was healthy behind the same-origin proxy. Production had no users or meaningful application data, so the implemented consumer set was enabled in one build rather than as a user canary.

The authentication cutover completed on 2026-07-21 with backend deployment `5d155af6-e84b-4a8a-a385-2867a01f8fc2`, GraphQL deployment `62755717-ecb6-4249-8ee7-748f229d620b`, and flag-enabled frontend deployment `75a3b29a-3870-492a-b99e-d6f0c5cd9475`, all from commit `9f3a4c86`. Production probes proved `csrfToken` returns `Cache-Control: no-store` and only the CSRF cookie, anonymous `currentUser` fails with `UNAUTHENTICATED`, and invalid login fails with `reason=INVALID_CREDENTIALS` without issuing an auth cookie. An isolated browser submission rendered the retained invalid-credentials UX while the backend recorded browser-originated `operationName="Login"` on `POST /graphql`.

The identity-lifecycle cutover completed from commit `44281ad3` with backend deployment `1fc4a8c1-7a73-4459-8868-d6826bd4ac99`, GraphQL deployment `7c9b6fc2-2af6-474b-be47-9ec1052a40f3`, and flag-enabled frontend deployment `0186d765-2661-49a6-9d77-f4c7e01e889e`. Non-mutating production probes verified malformed registration, unknown verification token, and non-enumerating missing-account resend. A browser load of an invalid verification link rendered the expected error while NestJS recorded `operationName="VerifyEmail"` with `INVALID_TOKEN`.

The password-recovery cutover completed from commit `28d0b0af` with backend deployment `eccd0bb5-02f7-4799-80e9-a9a47a776033`, GraphQL deployment `2037928f-a948-48ca-9828-a3735d28eca1`, and flag-enabled frontend deployment `83913ee7-6566-4820-b181-033ebaa9dd12`. Safe probes verified validation, generic missing-account behavior, invalid reset-token rejection, and authenticated-only profile access. A deployed forgot-password submission used GraphQL and rendered the generic success state without creating data or invoking the email provider.

The audience-segment cutover completed from commit `b0c618da` with backend deployment `f59a065e-51c7-43ee-8e17-943104d5f850`, GraphQL deployment `acb51cd1-f3e2-45c1-a011-18e6eeec611e`, and flag-enabled frontend deployment `81b86fd7-270d-414d-8162-9133df0e737a`. Read-only production probes validated all nine schema fields without mutation, confirmed `VITE_SEGMENTS_GRAPHQL=true`, and returned healthy site, API, and GraphQL responses. The existing authenticated browser session then loaded `/segments` and rendered the authoritative empty state and zero counts without an error or abandoned loader.

The reputation-review cutover completed from commit `6749ff27` with backend deployment `2f404c99-9a5e-4b46-9603-632a3f045a2a`, GraphQL deployment `4b297d81-7a5e-4af0-be02-505da701786d`, and flag-enabled frontend deployment `8b2b8b94-8d85-4c93-a55e-98f2b693ea2e`. Safe query and mutation probes proved the production schema and auth guard through the public proxy, `VITE_REPUTATION_REVIEWS_GRAPHQL=true` was confirmed from Railway, and an authenticated `/reviews` navigation rendered the authoritative empty state without a client or server error.

The reputation-analytics cutover completed from commit `4e9d63b4` with backend deployment `9723ae05-204f-493a-89f0-203c666f4e57`, GraphQL deployment `df732fda-7157-4a73-9c86-e3bcfa56dcb3`, and flag-enabled frontend deployment `c7fb43f1-2d5b-4f68-b473-fbe462ed87e9`. The public proxy recognized the complete query and auth guard, Railway confirmed `VITE_REPUTATION_ANALYTICS_GRAPHQL=true`, and an authenticated `/reviews` reload rendered all five metric cards plus the empty state. Nest logs paired that browser navigation with successful, zero-error `ReputationReviews` and `ReputationAnalytics` operations, so the active Reviews page has no retained REST application-data request.

The review-request management cutover completed from commit `19c1fa1a` with GraphQL deployment `18d3dc88-643a-4403-b6dc-06cf8b2427ad` and flag-enabled frontend deployment `a7c274eb-f66b-4b57-9127-7be49aa3485c`. Anonymous query and delete probes returned the intended `UNAUTHENTICATED` guard without touching data. Railway confirmed `VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL=true`; an authenticated `/review-requests` navigation rendered the authoritative empty state while Nest recorded zero-error `ReputationRequests` request `705fa2f4-bd2d-4c44-99fa-17e537f1c47e`.

The review-request delivery cutover completed from commits `2a6ffa4a` and `abc6a1e9`. Migration `040_reputation_request_deliveries` completed at `2026-07-22T05:09:49.628Z` before the stricter startup marker deployed. The legacy proxy deployment `2c51e9ea-ffeb-49b2-b081-dd4c8daf0bf1`, scheduler-enabled GraphQL deployment `48bd544a-3c6f-4ff4-9049-16116542cd10`, and flag-enabled frontend deployment `2369075e-cd85-40f6-b66b-b156e521527d` all reached `SUCCESS`. Railway confirmed both `REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED=true` and `VITE_REPUTATION_REQUEST_DELIVERY_GRAPHQL=true`; Nest logged the review-request delivery scheduler at its 60-second interval. Non-mutating production probes returned `200` for the site, API health, and public review SPA route, returned `404` with `Cache-Control: no-store` for an unknown 64-hex review token, and proved `sendReputationRequest` exists behind the public proxy by receiving the intended anonymous `UNAUTHENTICATED` GraphQL response. No provider delivery was sent during verification.

The reputation-configuration cutover completed from commit `272f138f` with legacy backend deployment `6659ec78-e5ce-4c9a-8831-51b75be02e90`, GraphQL deployment `5c54bd41-87cd-4d50-861b-80f919b7b7a2`, and flag-enabled frontend deployment `ca211f99-8de5-4b63-8bf7-8b5c9489f72f`. Railway confirmed `VITE_REPUTATION_PLATFORMS_GRAPHQL=true`, `VITE_REPUTATION_SETTINGS_GRAPHQL=true`, `VITE_REPUTATION_WIDGETS_GRAPHQL=true`, and the non-secret GraphQL `PUBLIC_API_URL` needed by generated embeds. Anonymous read/write probes resolved every new operation and returned the intended `UNAUTHENTICATED` guard without mutation. The widget runtime returned deployed JavaScript, malformed and unknown capabilities returned `404` plus `no-store`, and the exact capability-shaped endpoint allowed wildcard CORS without credentials. An authenticated `/review-widgets` load rendered the empty state without console errors while Nest recorded successful zero-error `ReputationWidgets` request `53445209-8622-406e-82c4-94f2fe62d439`. Platform and settings have enabled adapters but no active page callsite, so their gate is schema/auth plus the full local interoperability suite rather than a claimed browser request.

The administrator-operations cutover completed from commit `cc0060e5` with legacy backend deployment `4e106cb9-c7c0-4001-a294-a949607958cf`, GraphQL deployment `874fc457-af17-4e21-8f87-0bcd52858a98`, default-off frontend deployment `e3021b3b-57f2-4295-9f0f-913752651a7f`, and flag-enabled frontend deployment `452a30ec-cc32-4d7c-bf78-1a122fa7d55b`. Railway confirmed `VITE_ADMIN_DIRECTORY_GRAPHQL=true` and `VITE_ADMIN_PLAN_GRAPHQL=true`. Safe production query and mutation probes resolved all six operations and returned `UNAUTHENTICATED` without mutation; site and API health were `200`. The available signed-in browser identity was correctly denied the admin surface and redirected to `/dashboard` without console errors, so authenticated administrator success remains evidenced by fresh PostgreSQL rather than a production browser claim.

The core consumer evidence reconciliation completed on 2026-07-22 against legacy backend `ca7cbc74-3fa3-4201-8653-9759949b612f`, GraphQL `352bc5f6-bdf9-4a1b-b18c-51768342c9a3`, and frontend `b37a87c5-a28e-4981-885f-40401f679fc2`. Railway confirmed the authentication, onboarding, organization selector, contact, pipeline/deal, workspace content, and six approved analytics switches were already `true`. An authenticated browser loaded dashboard, contacts, pipelines, and canvas with no console error; Nest recorded zero-error session refresh/current-user, onboarding, organizations, dashboard/communication analytics, contact, pipeline, and workspace list/note/whiteboard queries. This promotes 68 live consumer rows while leaving the three blocked analytics definitions, broader organization administration, retained protocols, and all unexercised side effects outside the claim.

After deployment, verify:

1. `https://itemize.cloud` returns HTTP `200`;
2. production `/api/health` returns HTTP `200`;
3. a proxied GraphQL `__typename` query returns HTTP `200`;
4. all 83 domain `VITE_*_GRAPHQL` variables plus `VITE_AUTH_SESSION_GRAPHQL`, `VITE_AUTH_IDENTITY_GRAPHQL`, and `VITE_AUTH_RECOVERY_GRAPHQL` are `true`;
5. the frontend and backend deployments resolve to the Git commit containing this document;
6. GraphQL logs contain no internal-error spike after the frontend replacement.

## Rollback

Consumer rollback is data-neutral. Set only the affected domain variables to `false` and rebuild the frontend; the retained REST adapters read the same PostgreSQL rows. Authentication session rolls back as one unit with `VITE_AUTH_SESSION_GRAPHQL=false`; registration/verification/resend use `VITE_AUTH_IDENTITY_GRAPHQL=false`; forgot/reset password use `VITE_AUTH_RECOVERY_GRAPHQL=false`. Rebuild after any change, and do not split the coordinated session operations. Scheduler rollback is separate and must follow the mutually exclusive ownership procedure in [workflow-rollout-runbook.md](workflow-rollout-runbook.md).
