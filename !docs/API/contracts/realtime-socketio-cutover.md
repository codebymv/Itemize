# Realtime and Socket.IO cutover contract

**Status:** Durable single-socket-host handoff implemented; legacy authorization, revocation, reconnect recovery, chat termination, and workspace-note staging delivery verified
**Evidence date:** 2026-07-18

## Transport decision

Socket.IO remains a first-class protocol during the GraphQL and NestJS cutover. GraphQL replaces request/response application operations; it does not automatically replace presence, typing, reconnect, or room fan-out. Ephemeral typing and viewer presence should remain Socket.IO unless a later architecture decision demonstrates a concrete benefit from GraphQL subscriptions. Durable domain-change notifications may later become GraphQL subscriptions or cache-invalidation events, but that is a separate migration with its own compatibility window.

The generated REST ledger intentionally does not inventory Socket.IO events. This document and its protocol tests are the authority for the realtime surface.

## Authentication and capability boundary

- Private user and organization rooms authenticate only from the signed `itemize_auth` httpOnly cookie supplied during the Socket.IO handshake. Event payload JWTs, query-string JWTs, and browser-storage JWTs are not accepted.
- A user-canvas join derives `userId` from the verified cookie. The client cannot choose the user room.
- Organization chat and social joins require a positive safe integer `organizationId` and a current `organization_members` row for the authenticated user.
- Public list, note, whiteboard, and wireframe joins use exact UUID share capabilities and re-check that the backing object is still public.
- Visitor chat joins use exact `cs_` plus 48 lowercase hexadecimal session capabilities and re-check that the session is active.
- Capability values are bearer secrets. They must not appear in logs, traces, analytics, error messages, or nonessential event payloads. A socket may hold at most eight public content capabilities.
- Admission and event authorization fail closed on database errors. Client-visible failures use `realtimeError { code, message }`; internal database details are not returned.

## Room and event inventory

| Client event | Admission | Room | Server acknowledgement/error |
| --- | --- | --- | --- |
| `joinUserCanvas` | Signed cookie | `user-canvas-{userId}` | `joinedUserCanvas { userId }` |
| `joinSharedList` | Active UUID share capability | `shared-list-{capability}` | `joinedSharedList { listTitle }` |
| `joinSharedNote` | Active UUID share capability | `shared-note-{capability}` | `joinedSharedNote { noteTitle }` |
| `joinSharedWhiteboard` | Active UUID share capability | `shared-whiteboard-{capability}` | `joinedSharedWhiteboard { whiteboardTitle }` |
| `joinSharedWireframe` | Active UUID share capability | `shared-wireframe-{capability}` | `joinedSharedWireframe { wireframeTitle }` |
| `joinChatSession` | Active chat-session capability | `chat-session-{capability}` | `joinedChatSession { sessionId }` |
| `joinOrgChat` | Cookie plus organization membership | `org-chat-{organizationId}` | `joinedOrgChat { organizationId }` |
| `joinOrgSocial` | Cookie plus organization membership | `org-social-{organizationId}` | `joinedOrgSocial { organizationId }` |

Public-content rooms emit `viewerCount` and one content event (`listUpdated`, `noteUpdated`, `whiteboardUpdated`, or `wireframeUpdated`). Viewer count remains protocol telemetry for server-side presence validation; it is not a supported shared-page UI feature and the shipped pages do not subscribe to it. Content payloads retain the legacy envelope `{ type, data, timestamp }`. User canvas emits `userListUpdated`, `userListDeleted`, and `userWireframeUpdated` with the same envelope. Event-specific `type` values currently come from the owning mutation route and include full-update, field-change, position-change, item-change, and deletion variants. Deleting a public list now emits `listUpdated { type: "listDeleted", data, timestamp }`; the list viewer clears its projection and disconnects, matching the existing note and whiteboard deletion behavior.

Successful list, note, whiteboard, and wireframe unshare operations emit `sharedContentRevoked { kind, reason, timestamp }` to the old room without exposing the capability, then remove every socket returned by the Socket.IO adapter from that room. The three reachable public viewers immediately discard their local projection, disconnect, and render the unavailable state. Database revocation completes before eviction begins; an outsider or missing-object response never publishes an eviction.

Chat emits `newChatSession`, `newChatMessage`, `chatSessionEnded`, `agentTyping`, and `visitorTyping`. Ending a session commits `status = 'ended'` first, emits the existing organization notification, emits a token-free `chatSessionEnded { reason, timestamp }` to the visitor room, and removes every visitor socket returned by the adapter. Visitor and agent message writes lock the active session row in their transaction, so an end/send race resolves before the terminal transition. A terminated socket cannot publish visitor typing, a reconnect cannot rejoin, retained HTTP typing and agent-message writes require an active session, and reading retained transcript history cannot restore online presence. Social emits `social_message`. Chat and social have distinct organization rooms; the legacy `org-{id}`/`org_{id}` mismatch is removed.

`agentTyping { sessionToken, isTyping }` requires cookie authentication plus current membership in the active session's organization. `visitorTyping { sessionToken, isTyping }` is accepted only after the same socket has joined that active session capability. `isTyping` is a strict boolean. Typing output uses camelCase and never includes the raw session capability.

## Reconnect and delivery semantics

Socket.IO reconnection creates a new socket and loses all room membership. Every browser consumer emits its join again from the `connect` handler. Joins are idempotent for tracking and are reauthorized on every connection. Clients set `withCredentials: true`; server CORS also permits credentials for the configured origins.

The shipped list, note, and whiteboard viewers register their handlers before connecting and do not become live merely because the transport connected. The first authorized `joined` acknowledgement establishes the live session without a redundant read. After a disconnect, a new authorized `joined` acknowledgement gates an authoritative HTTP refetch; updates received during recovery are queued and applied only after that refetch succeeds. An `INVALID_CAPABILITY` response clears the stale projection and disconnects. A failed recovery read leaves the last-loaded static projection visible but offline, discards queued updates, and reports the failure.

Legacy HTTP mutations still emit best-effort in process. Nest mutations must
instead use `RealtimeOutboxService` with their existing PostgreSQL transaction.
One `realtime_event_outbox` row represents one audience. The event key is
idempotent, the payload is capped at 64 KiB, and database constraints bind
list/note aggregates to the allowed private or shared channel and recipient
format.

The legacy Socket.IO host owns the opt-in worker. It claims rows using
`FOR UPDATE SKIP LOCKED`, attempt fencing, a named worker, and an expiring
lease. Transient failures retry with bounded exponential delay; exhausted or
invalid events dead-letter with a redacted error. A successful emit records
delivery and clears the claim. Socket.IO acknowledgement is not a client
receipt, so the contract is at-least-once publication, not exactly-once
observation. Every event payload is an idempotent projection and reconnect
still performs an authoritative refetch.

`REALTIME_OUTBOX_WORKER_ENABLED` defaults to false. Migration
`028_realtime_outbox` and the matching Nest mutation enqueue must be deployed
before enabling it. The worker uses the committed `occurred_at` value for the
legacy `{ type, data, timestamp }` envelope.

## Scaling and revocation blockers

The following block multi-instance realtime cutover, but not a single-instance GraphQL request/response migration:

1. Room fan-out and viewer maps are process-local. Before running multiple API instances, add a supported Socket.IO adapter (normally Redis) and replace local viewer counting with adapter-aware or separately stored presence.
2. Public-content revocation and chat-session termination now use adapter-wide `fetchSockets`, room emit, and leave operations, and live tests prove immediate eviction on the current in-memory adapter. Multi-instance proof still requires the selected shared adapter.
3. The outbox provides ordered durable handoff but no browser replay cursor.
   Reconnect recovery remains the correctness boundary for missed or duplicate
   observations.
4. No active frontend source consumer was found for organization chat or social events. Those protocols must not be declared production-required until a reachable consumer or external client is identified.
5. Viewer count is retained only as protocol telemetry for presence/scaling verification. It must not be advertised as a user-facing feature unless a later product decision adds UI and browser coverage.

## GraphQL/NestJS ownership

NestJS exposes `RealtimeOutboxModule`; resolvers never call Socket.IO rooms
directly. A mutation repository writes its domain rows and every required
audience row with the same `PoolClient`, then commits. Reusing an event key with
different content fails rather than silently discarding a side effect. Event
schemas need explicit versions before payload shapes change. A future GraphQL
subscription layer, if chosen, consumes the same domain events and repeats
authorization on subscribe and after tenant/capability revocation.

## Required parity scenarios

- forged event JWT cannot select another user's canvas or organization;
- missing, malformed, expired, inactive, or foreign capabilities fail without room admission;
- organization member succeeds and non-member fails without tenant enumeration;
- anonymous `agentTyping` spoofing fails before broadcast;
- visitor typing requires a prior verified join on the same socket;
- repeated joins do not inflate viewer counts and disconnect removes tracking;
- reconnect reauthorizes, refetches authoritative state, and rejoins before accepting queued events;
- database failures fail closed without leaking query details or capabilities;
- an outbox insert rolls back with its domain transaction;
- identical event-key replay deduplicates and conflicting reuse fails;
- competing workers deliver once, transient failure retries, and an expired
  lease is recovered once;
- a committed outbox event reaches a live Socket.IO room with its commit-time
  timestamp;
- public revocation evicts existing sockets before multi-instance production rollout;
- chat-session termination evicts active visitors, denies rejoin and post-end visitor/agent writes, and keeps transcript reads from restoring presence;
- two API instances provide correct fan-out, presence counts, and revocation through the selected adapter;
- browser tests prove static fallback, reconnect/refetch, deletion, and capability rotation behavior. **Passed locally on 2026-07-17.**

The executable baseline includes 16 Socket.IO boundary unit cases, 4 Nest
enqueue cases, 5 PostgreSQL outbox cases, 8 live Socket.IO/PostgreSQL
scenarios, route-level proof for all four public-content revocation paths, 4
focused frontend recovery cases, and a repeatable 4-scenario Chromium gate.
The outbox cases prove rollback, idempotency conflict detection, competing
claims, retry, expired-lease recovery, and a database row reaching a real
shared-note client. Production and Railway remain untouched and the worker
flag remains off.

Run the browser gate from `backend/` with `npm run test:browser:shared-realtime`. It starts a disposable local HTTP/Socket.IO fixture and Vite instance, launches real headless Chromium, and leaves no database or cloud resources. The gate drops the live transport, holds the recovery read, and proves an authoritative refetch completes before a queued update is applied; proves a failed recovery read preserves the last projection in the offline state; proves a live deletion clears the projection; and proves capability rotation denies the old link while admitting the new one. The run also exposed and closed the missing public-list deletion broadcast. The rendered live page was separately inspected in the in-app browser. Production and Railway were untouched. The complete fresh-database baseline is maintained in [GraphQL + NestJS cutover readiness](../graphql-nestjs-cutover-readiness.md).

On 2026-07-18 the deployed staging note-mutation gate temporarily enabled the
legacy outbox worker and used the real owner canvas plus an already-open public
note viewer. GraphQL title and rich-content mutations each reached the public
viewer without a reload, and GraphQL deletion immediately rendered the
deleted-content state. The worker logged successful leased delivery cycles and
the GraphQL service logged the matching successful operations. Cleanup removed
all fixture outbox rows, restored the worker flag to absent/default-off, and
redeployed the legacy backend successfully as
`7f9cce4e-c9e2-45ad-94da-517dad9e27d6`. This proves the current
single-socket-host staging handoff; it does not remove the shared-adapter
multi-instance blocker.
