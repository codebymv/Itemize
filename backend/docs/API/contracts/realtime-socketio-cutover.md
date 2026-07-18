# Realtime and Socket.IO cutover contract

**Status:** Phase 0 characterized; legacy authorization, public-content revocation, shared-viewer reconnect recovery, and chat-session termination hardened
**Evidence date:** 2026-07-17

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

Public-content rooms emit `viewerCount` and one content event (`listUpdated`, `noteUpdated`, `whiteboardUpdated`, or `wireframeUpdated`). Content payloads retain the legacy envelope `{ type, data, timestamp }`. User canvas emits `userListUpdated`, `userListDeleted`, and `userWireframeUpdated` with the same envelope. Event-specific `type` values currently come from the owning mutation route and include full-update, field-change, position-change, item-change, and deletion variants.

Successful list, note, whiteboard, and wireframe unshare operations emit `sharedContentRevoked { kind, reason, timestamp }` to the old room without exposing the capability, then remove every socket returned by the Socket.IO adapter from that room. The three reachable public viewers immediately discard their local projection, disconnect, and render the unavailable state. Database revocation completes before eviction begins; an outsider or missing-object response never publishes an eviction.

Chat emits `newChatSession`, `newChatMessage`, `chatSessionEnded`, `agentTyping`, and `visitorTyping`. Ending a session commits `status = 'ended'` first, emits the existing organization notification, emits a token-free `chatSessionEnded { reason, timestamp }` to the visitor room, and removes every visitor socket returned by the adapter. Visitor and agent message writes lock the active session row in their transaction, so an end/send race resolves before the terminal transition. A terminated socket cannot publish visitor typing, a reconnect cannot rejoin, retained HTTP typing and agent-message writes require an active session, and reading retained transcript history cannot restore online presence. Social emits `social_message`. Chat and social have distinct organization rooms; the legacy `org-{id}`/`org_{id}` mismatch is removed.

`agentTyping { sessionToken, isTyping }` requires cookie authentication plus current membership in the active session's organization. `visitorTyping { sessionToken, isTyping }` is accepted only after the same socket has joined that active session capability. `isTyping` is a strict boolean. Typing output uses camelCase and never includes the raw session capability.

## Reconnect and delivery semantics

Socket.IO reconnection creates a new socket and loses all room membership. Every browser consumer emits its join again from the `connect` handler. Joins are idempotent for tracking and are reauthorized on every connection. Clients set `withCredentials: true`; server CORS also permits credentials for the configured origins.

The shipped list, note, and whiteboard viewers register their handlers before connecting and do not become live merely because the transport connected. The first authorized `joined` acknowledgement establishes the live session without a redundant read. After a disconnect, a new authorized `joined` acknowledgement gates an authoritative HTTP refetch; updates received during recovery are queued and applied only after that refetch succeeds. An `INVALID_CAPABILITY` response clears the stale projection and disconnects. A failed recovery read leaves the last-loaded static projection visible but offline, discards queued updates, and reports the failure.

Events are currently best-effort, in-process notifications emitted after legacy HTTP mutations. They are not a durable business-event log: a process failure between commit and emit can lose a notification, so reconnect recovery depends on the authoritative refetch rather than event replay. Any notification that becomes must-deliver needs a transactional outbox and replay cursor rather than stronger promises layered onto the current emitter.

## Scaling and revocation blockers

The following block multi-instance realtime cutover, but not a single-instance GraphQL request/response migration:

1. Room fan-out and viewer maps are process-local. Before running multiple API instances, add a supported Socket.IO adapter (normally Redis) and replace local viewer counting with adapter-aware or separately stored presence.
2. Public-content revocation and chat-session termination now use adapter-wide `fetchSockets`, room emit, and leave operations, and live tests prove immediate eviction on the current in-memory adapter. Multi-instance proof still requires the selected shared adapter.
3. Route commits and realtime emits have no transactional outbox, delivery ID, replay cursor, or ordering contract.
4. No active frontend source consumer was found for organization chat or social events. Those protocols must not be declared production-required until a reachable consumer or external client is identified.
5. Shared pages receive viewer counts but do not render them. Browser coverage must decide whether presence is a supported feature or removable telemetry.

## GraphQL/NestJS ownership

NestJS should expose a dedicated `RealtimeModule` that consumes authenticated context and domain events; resolvers must not call Socket.IO rooms directly. Domain services commit first, then publish typed events through an interface implemented by the legacy emitter during dual run. Event schemas need explicit versions before payload shapes change. A future GraphQL subscription layer, if chosen, consumes the same domain events and repeats authorization on subscribe and after tenant/capability revocation.

## Required parity scenarios

- forged event JWT cannot select another user's canvas or organization;
- missing, malformed, expired, inactive, or foreign capabilities fail without room admission;
- organization member succeeds and non-member fails without tenant enumeration;
- anonymous `agentTyping` spoofing fails before broadcast;
- visitor typing requires a prior verified join on the same socket;
- repeated joins do not inflate viewer counts and disconnect removes tracking;
- reconnect reauthorizes, refetches authoritative state, and rejoins before accepting queued events;
- database failures fail closed without leaking query details or capabilities;
- public revocation evicts existing sockets before multi-instance production rollout;
- chat-session termination evicts active visitors, denies rejoin and post-end visitor/agent writes, and keeps transcript reads from restoring presence;
- two API instances provide correct fan-out, presence counts, and revocation through the selected adapter;
- browser tests prove static fallback, reconnect/refetch, deletion, and capability rotation behavior.

The current executable baseline includes 16 boundary unit cases, 7 live Socket.IO/PostgreSQL scenarios, route-level PostgreSQL proof for all four public-content revocation paths, and 4 focused frontend realtime cases covering active revocation, reconnect/refetch ordering, capability denial, and failed-refetch fallback. The fresh run proves two connected public viewers receive the token-free revocation event and leave their room; it also proves the real end-session HTTP route commits the terminal state, notifies agents and visitors, evicts the visitor, denies rejoin and post-end visitor/agent writes, and does not let a transcript read restore online presence. The frontend contract proves the shipped shared viewers do not accept queued events until recovery completes, but a real browser/network-disruption journey is still required. The complete fresh-database baseline is maintained in [GraphQL + NestJS cutover readiness](../graphql-nestjs-cutover-readiness.md).
