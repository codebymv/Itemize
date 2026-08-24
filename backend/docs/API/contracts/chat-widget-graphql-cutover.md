# Chat Widget operator GraphQL cutover

## Scope

The authenticated Chat Widget workspace is owned by `ChatWidgetModule` in the
NestJS service. The frontend calls GraphQL directly for:

- widget configuration read, creation, and update;
- embed-code generation;
- session list and detail;
- agent message submission; and
- session conversion to a contact and conversation.

The eight authenticated Express routes are removed. Public widget bootstrap,
visitor session creation, message polling/submission, session termination, and
typing remain HTTP because they are rate-limited, bearer-capability operations
used by externally embedded visitors. Socket.IO remains the live visitor
delivery protocol.

## Retained public visitor protocol (NestJS port)

`ChatWidgetPublicModule` now owns an identical implementation of all six
retained public routes. The legacy origin mounts a default-off proxy
(`CHAT_WIDGET_PUBLIC_NESTJS_ENABLED`) ahead of the retained handlers; while the
flag is off every request falls through to legacy unchanged, preserving
rollback.

Agent-room notifications (`newChatSession`, `newChatMessage`, `visitorTyping`,
`chatSessionEnded`) and visitor-socket eviction on session end are emitted
through the NestJS realtime host, so `CHAT_WIDGET_PUBLIC_NESTJS_ENABLED` must
only be enabled in the runtime where `REALTIME_HOST_NESTJS_ENABLED` is on —
the same socket-origin runtime clients connect to. Enabling the chat flag
without the host would silently drop agent notifications.

During the port both runtimes received the same defect fix: the config route's
business-hours evaluation used the invalid `Intl` weekday option `'lowercase'`
and threw, which failed every widget with configured business hours closed.
Both runtimes now lowercase the valid long-form weekday, and the dual-runtime
parity suite pins the open/closed evaluation.

## Security and tenancy

- Every widget, session, message, contact, conversation, and assignee lookup is
  organization-qualified.
- Foreign identifiers are concealed as `NOT_FOUND`.
- Widget writes, agent messages, and conversion are CSRF-protected mutations.
- The public `session_token` bearer capability is absent from the authenticated
  GraphQL schema and operator projections.
- A default assignee must be a current member of the selected organization.
- Colors, URLs, positions, business hours, custom fields, allowed domains,
  paging, status, message content, and idempotency keys are bounded before SQL.
- A database uniqueness constraint enforces one widget per organization under
  concurrent creation.

## Agent message delivery

`sendAgentChatMessage` locks the active tenant session and claims an
organization-scoped idempotency key. Replaying the same request returns the
original message; reusing the key with different content is rejected.

The message and one `newChatMessage` realtime outbox row commit atomically. The
retained leased worker validates the `cs_` visitor capability, publishes to the
existing Socket.IO session room, and records delivery or a retryable failure.
GraphQL therefore reports committed local state without pretending that an
ephemeral socket emission is itself transactional.

## Session conversion

`convertChatSession` row-locks the tenant session. The first conversion creates
one active contact with the current valid contact vocabulary, creates one
conversation, copies the ordered transcript, and records both identifiers on
the converted session in one transaction. Concurrent or repeated conversion
is rejected after the lock observes the committed contact, without duplicating
the contact, conversation, or transcript.

## Verification

- Fresh PostgreSQL coverage proves one-widget concurrency, CSRF enforcement,
  tenant-member assignment, capability-field schema denial, tenant-isolated
  list/detail reads, idempotent agent replies, durable retained-worker Socket.IO
  delivery, and exact-once conversion.
- Frontend transport coverage proves all authenticated functions use GraphQL
  while the public visitor adapter remains HTTP.
- Realtime unit coverage proves the new channel contract and delivery mapping.
- The generated API ledger explicitly retains all six public visitor protocol
  operations and contains no authenticated Chat Widget REST operation.
- A dual-runtime fresh-PostgreSQL parity suite drives the NestJS port and the
  retained legacy handlers with identical requests (config with business-hours
  variants, session start/validation, cross-runtime session resume, message
  polling with `after`, visitor submission, end-session replay denial, typing),
  and asserts the agent-room events and visitor eviction through a live
  Socket.IO client connected to the NestJS realtime host.
