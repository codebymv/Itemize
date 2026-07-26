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
