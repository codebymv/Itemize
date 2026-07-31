# Reputation request management GraphQL cutover contract

**Status:** Permanent GraphQL cutover; authenticated REST retired

**Evidence date:** 2026-07-31

## Decision

The authenticated management read and delete are owned exclusively by `reputationRequests` and `deleteReputationRequest` in `ReputationRequestsModule`.

Request creation, bulk creation, and resend use `sendReputationRequest`, `sendBulkReputationRequests`, and `resendReputationRequest` unconditionally. Provider work persists as an idempotent delivery intent before I/O, records only confirmed email/SMS acceptance, retries bounded known rejections, and sends ambiguous SMS outcomes to operator reconciliation. An in-process scheduler on the existing GraphQL service owns due delivery. Public collection remains a separate retained HTTP capability.

## Read contract

The query requires verified organization context, accepts an optional status and bounded page input, and returns a stable `created_at DESC, id DESC` page. Status is limited to the persisted request lifecycle; `all` means no filter. Count and rows share one read-only repeatable-read transaction. The contact join is qualified by both contact and organization, so a corrupt cross-tenant pointer cannot project another tenant's current contact data.

The GraphQL projection preserves the active page's retained shape through a casing adapter but deliberately omits `unique_token`. That token is a public capability and is not needed by the authenticated management UI.

## Delete contract

Deletion requires CSRF and verified organization context, qualifies the row by request and organization, returns the exact deleted ID, and exposes foreign or repeated misses only as `NOT_FOUND`.

## Evidence and permanent retirement

Repository and service tests prove snapshot reuse, parameterized filtering, deterministic ordering, tenant-qualified joins, token omission, page/status validation, rollback, exact deletion, and private misses. Fresh PostgreSQL proves stable same-timestamp paging, foreign-contact concealment, status filtering, CSRF denial, tenant isolation, exact deletion, durable delivery idempotency, bulk atomicity, retry, provider confirmation, and ambiguous-SMS reconciliation. Frontend tests prove retained-shape paging, organization forwarding, CSRF, delete-identity verification, stable idempotency keys, bulk mapping, resend identity, and unconditional GraphQL dispatch.

Permanent retirement on 2026-07-31 removed both rollout variables, all five frontend REST branches, and the Express request subrouter. Full route composition requires the five former methods and paths to return `404`. Verification passed 347 frontend, 412 Express unit, 492 Nest unit/HTTP, 344 Express/PostgreSQL, and 269 Nest/PostgreSQL tests. Consumer rollback requires redeploying the preceding application commit. Scheduler ownership remains independently controlled by `REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED`.

Production cutover completed from commit `19c1fa1a` with GraphQL deployment `18d3dc88-643a-4403-b6dc-06cf8b2427ad` and flag-enabled frontend deployment `a7c274eb-f66b-4b57-9127-7be49aa3485c`. Safe anonymous query and delete probes reached the registered operations through the public proxy and returned `UNAUTHENTICATED` without touching data. Railway confirmed `VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL=true`; an authenticated `/review-requests` navigation rendered the authoritative empty state while Nest recorded successful zero-error `ReputationRequests` request `705fa2f4-bd2d-4c44-99fa-17e537f1c47e`.

Durable delivery cutover completed from commits `2a6ffa4a` and `abc6a1e9` after migration `040_reputation_request_deliveries`. GraphQL deployment `48bd544a-3c6f-4ff4-9049-16116542cd10` runs the 60-second delivery scheduler and frontend deployment `2369075e-cd85-40f6-b66b-b156e521527d` enabled the consumer. Anonymous production probing proved the mutations exist behind `UNAUTHENTICATED` without invoking either provider.
