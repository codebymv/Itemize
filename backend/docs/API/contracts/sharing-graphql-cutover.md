# Public sharing GraphQL cutover contract

**Status:** Phase 0 characterization

**Evidence date:** 2026-07-15

## Decision

Authenticated enable/disable operations move to GraphQL. Public capability reads remain rate-limited HTTP because they are link-oriented, unauthenticated protocols and must work without a GraphQL client or session. The 14 registered list, note, whiteboard, wireframe, and vault sharing operations are assigned in `graphql-operation-overrides.json`.

`WorkspaceSharingModule` owns list, note, whiteboard, and wireframe issuance/revocation. `VaultSharingModule` owns vault issuance/revocation and its retained public read. `PublicSharingModule` owns retained list, note, and whiteboard reads. A public wireframe read does not exist and the frontend has no corresponding route, so both wireframe sharing mutations remain blocked pending a product decision.

## Ownership and authority

Workspace objects in this legacy surface are personal objects keyed by `user_id`, not organization resources. An authenticated mutation may alter sharing only when the current user owns the object. Another user's identifier returns the same not-found result as an absent object. Adding organization context during the rewrite must not accidentally make every organization member an owner; collaboration permissions require a separate explicit model.

Public requests derive all authority from the path token. They never accept a user, organization, owner, or object identifier as additional authority. Token failures, disabled shares, deleted objects, and malformed tokens use the same non-enumerating not-found response.

## Capability lifecycle and concurrency

Enable is an atomic database mutation. If an object is already public, repeated or simultaneous calls return the one active token and do not move `shared_at`. If the object is private, enable creates a new token and timestamps issuance. The former select-then-update implementation could return two different tokens during a race; it is now a single locked PostgreSQL update and has concurrent coverage.

Disable atomically sets `is_public = false`, clears `share_token`, and clears `shared_at`. Re-enabling always issues a different token. The former implementation retained the token and resurrected a revoked URL on re-share; legacy list, note, whiteboard, wireframe, and vault routes now clear it.

The target stores only a keyed hash of a cryptographically random capability with at least 128 random bits. Raw tokens appear only in the one issuance response and user-facing URL. They are redacted from logs, traces, analytics, errors, GraphQL results after issuance, database exports, and realtime event payloads. Token rotation and revocation are security events with owner, object, correlation ID, and server timestamp, but never the raw token.

Object deletion revokes access by cascade/object absence. Ownership transfer, account deletion, administrator recovery, and restore-from-backup behavior must explicitly define whether capabilities rotate; preserving an old public capability by accident is forbidden.

## Public HTTP contract

Public reads are `GET` only, independently rate limited, bounded by response size/time, and protected from token enumeration. Successful and error responses send:

- `Cache-Control: private, no-store`
- `Referrer-Policy: no-referrer`
- `X-Robots-Tag: noindex, nofollow`

The public pages also set a restrictive CSP and do not place the token in telemetry, third-party resource URLs, or outbound referrers. A service worker, CDN, browser history integration, preview bot, and application cache must not retain revoked content.

Responses contain an allowlisted public projection only. They omit owner email, tenant metadata, internal permissions, share token, encryption metadata, and unrelated object fields. `creator_name` is currently public for list/note/whiteboard and is a deliberate schema field, not an accidental `SELECT *` consequence.

## Content safety

Public note HTML is sanitized on the server immediately before output and rendered only through the approved sanitized-content component. Lists sanitize every item recursively. Whiteboard/canvas data is recursively traversed without converting arrays to objects, and prototype keys are discarded.

DOM sanitization alone is not a complete canvas schema. Before cutover, define allowed node types, field names, URL schemes, embedded media behavior, maximum nesting/node/string/aggregate sizes, and handling of malformed JSON. Do not allow a canvas renderer to fetch arbitrary internal or credential-bearing URLs. The same rule applies if a public wireframe viewer is implemented.

Output encoding remains contextual: React text, sanitized HTML, SVG/canvas attributes, CSS values, and URLs do not share one sanitizer contract. Sanitized source content must never be reinterpreted in a more powerful context by a consumer.

## Vault sharing

A vault share is a bearer capability that returns decrypted item values. Database encryption does not protect a deliberately shared response. The UI and mutation must state this plainly and require an explicit confirmation; marketing copy must not imply the shared response remains encrypted from the link holder.

Locked vaults cannot be read publicly. The target should also refuse issuance while locked rather than create a dormant public capability. Public vault responses are no-store, rate limited, excluded from indexing and telemetry, and never written to logs, error monitoring breadcrumbs, browser persistence, analytics, or caches. Decryption errors fail closed for the affected response; returning a partial sentinel next to other secrets is not an auditable delivery contract.

The current frontend expected an unwrapped vault object while the backend returned the common `{ success, data }` envelope. The consumer now unwraps share, unshare, and public-read responses, with a focused frontend contract test.

Before traffic cutover, product/security must choose one of:

1. keep bearer-link vault sharing with explicit consent, hashed high-entropy capabilities, optional expiry, immediate revocation, and the controls above;
2. require recipient authentication and an access grant; or
3. remove vault public sharing.

## Realtime behavior

Legacy Socket.IO rooms are keyed by raw share token. New joins verify that the object is still public, while content mutations broadcast only when the object remains public. Successful list, note, whiteboard, and wireframe unshare operations now emit the token-free `sharedContentRevoked` event and use adapter-wide Socket.IO room operations to remove every connected viewer. The three reachable public pages discard their local projection and render the unavailable state. They also reauthorize and refetch before accepting queued updates after reconnect, so a capability revoked while offline clears stale content instead of silently restoring a live session. The nonexistent wireframe viewer remains a separate product gap.

The target freezes room authorization, event names, payload projections, reconnect behavior, rate limits, and revocation semantics in the separate realtime contract. GraphQL subscriptions do not inherit authorization merely because the initial HTTP query was authorized. Active subscribers must be disconnected or denied on their next event immediately after revoke.

## Wireframe gap

The backend can issue and revoke a wireframe token, but no `GET /api/shared/wireframe/:token` operation exists and `App.tsx` has no `/shared/wireframe/:token` page. The former API-host URL was also wrong and now uses the frontend base URL, but that does not create a viewer.

Do not expose `enableWireframeSharing` in the new schema until the product either implements and tests a retained public viewer or removes the share action and migrates existing public flags/tokens to revoked state.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Ownership | owner success, outsider not-found, absent/malformed IDs, ownership transfer and deletion |
| Issuance | first enable, already enabled, simultaneous enable, unique token collision retry, stable `shared_at` |
| Revocation | disable, repeated disable, old-token denial, re-enable rotation, delete/restore behavior |
| Public lookup | valid, malformed, unknown, revoked and deleted token; non-enumerating errors; rate limit |
| Projection | exact allowlist, creator-name decision, nulls, timestamps, large payload rejection |
| Content safety | nested arrays/objects, prototype keys, HTML/SVG/URL/CSS payloads, depth/size bounds |
| Caching/privacy | no-store/noindex/referrer headers, CDN/service worker behavior, telemetry redaction |
| Vault | locked state, issuance policy, explicit consent, no items, decrypted items, decrypt failure, revoke during read |
| Realtime | join, reconnect, mutation events, revoke/rotate disconnect, token redaction, payload bounds |
| Consumers | share modal, copy/open link, public page, revoked/invalid UI, vault envelope, wireframe decision |

## Current evidence and exit gate

Fresh PostgreSQL coverage proves stable concurrent list, vault, and wireframe issuance; owner-only mutation across all five object types; immediate list, note, whiteboard, wireframe, and vault revocation; token clearing and rotation; malformed-token handling; nested whiteboard sanitization; note markup sanitization; and no-store privacy headers. Live Socket.IO coverage proves two active viewers receive a redacted revocation event and are evicted. Four focused frontend realtime cases prove active revocation removal, reconnect/refetch ordering, revoked-while-offline denial, and static offline fallback after a failed recovery read; the vault contract test separately proves all three sharing wrappers expose the domain payload rather than the REST envelope.

This slice is not ready for traffic until:

1. raw tokens are replaced with hashed high-entropy capabilities and token redaction is verified end to end;
2. public response size/schema limits and context-specific content/URL safety are executable;
3. vault sharing has an approved security/product model, explicit consent, locked-issuance behavior, and secret-safe failure/observability tests;
4. realtime authorization and immediate revocation are frozen and tested;
5. wireframe sharing is implemented end to end or removed;
6. GraphQL mutations, retained HTTP reads, and browser journeys pass semantic parity, cache, telemetry, and rollback tests.
