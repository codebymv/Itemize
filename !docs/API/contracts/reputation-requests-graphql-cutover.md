# Reputation request management GraphQL cutover contract

**Status:** Dual parity behind default-off `VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL`

**Evidence date:** 2026-07-21

## Decision

The authenticated management read `GET /api/reputation/requests` and delete `DELETE /api/reputation/requests/:id` move to `reputationRequests` and `deleteReputationRequest` in `ReputationRequestsModule`. The flag controls only those two operations.

Request creation and delivery remain on REST: `POST /api/reputation/requests/send`, `POST /api/reputation/requests/bulk`, and `POST /api/reputation/requests/:id/resend` cross email/SMS provider boundaries and need a durable intent, idempotency, retry, and confirmed-postcondition contract before migration. Public collection and unsubscribe behavior also remain separate protocol slices.

## Read contract

The query requires verified organization context, accepts an optional status and bounded page input, and returns a stable `created_at DESC, id DESC` page. Status is limited to the persisted request lifecycle; `all` means no filter. Count and rows share one read-only repeatable-read transaction. The contact join is qualified by both contact and organization, so a corrupt cross-tenant pointer cannot project another tenant's current contact data.

The GraphQL projection preserves the active page's retained shape through a casing adapter but deliberately omits `unique_token`. That token is a public capability and is not needed by the authenticated management UI.

## Delete contract

Deletion requires CSRF and verified organization context, qualifies the row by request and organization, returns the exact deleted ID, and exposes foreign or repeated misses only as `NOT_FOUND`. Deleting through GraphQL is immediately visible through the retained REST list without repair.

## Evidence and rollback

Repository and service tests prove snapshot reuse, parameterized filtering, deterministic ordering, tenant-qualified joins, token omission, page/status validation, rollback, exact deletion, and private misses. Fresh PostgreSQL proves stable same-timestamp paging, foreign-contact concealment, status filtering, CSRF denial, tenant isolation, exact deletion, and REST interoperability. Frontend tests prove the flag is independently default-off, retained-shape paging, organization forwarding, CSRF, and delete-identity verification.

The complete gates pass 331/331 NestJS unit cases, 192/192 NestJS/PostgreSQL cases, 489/489 retained Express/PostgreSQL cases, and 300/300 frontend cases. Both production builds pass. Setting only `VITE_REPUTATION_REQUEST_MANAGEMENT_GRAPHQL=false` and rebuilding restores list/delete to REST against the same rows; delivery routes never move with this flag.
