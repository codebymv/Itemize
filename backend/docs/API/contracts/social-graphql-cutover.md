# Social workspace GraphQL cutover

## Scope

The authenticated Social workspace is owned by `SocialModule` in the NestJS
service. The frontend calls GraphQL directly for:

- `socialChannels` and `disconnectSocialChannel`
- `socialConversations`, `socialConversation`, and
  `openSocialConversation`
- `updateSocialConversation`
- `sendSocialMessage`
- `socialAnalytics`

The original authenticated Express channel, conversation, message-send, and
analytics routes are removed. Facebook OAuth initiation/callback and Meta
webhook verification/delivery remain HTTP because they are browser/provider
protocol boundaries.

## Security and tenancy

- Channel projections never include page or user access tokens.
- Every channel, conversation, message, contact, and assignee lookup is
  organization-qualified.
- Foreign identifiers are concealed as `NOT_FOUND`.
- Disconnect, open/read, update, and send are CSRF-protected mutations.
- Conversation status, channel type, IDs, paging, tags, message length,
  analytics period, and idempotency keys are bounded before SQL.
- Assignees must be current organization members and contacts must belong to
  the selected organization.

Opening a conversation is an explicit mutation because it clears unread state.
The pure `socialConversation` query has no hidden write.

## Outbound delivery

`sendSocialMessage` atomically creates one pending message and one
`social_message_delivery_jobs` row under an organization-scoped idempotency
key. The response is an enqueue receipt, not a provider-delivery receipt.

The leased scheduler:

1. rechecks that the current channel is connected and configured;
2. sends to Meta outside a database transaction;
3. marks the message sent and updates the conversation only after a provider
   message ID is returned;
4. marks definite rejection as failed; and
5. fences network, timeout, provider-overload, missing-receipt, expired-lease,
   and post-provider local-commit ambiguity as `reconciliation_required`
   without blindly resending.

Provider credentials are loaded only inside a claimed worker row and are never
part of GraphQL types, delivery-job payloads, logs, or frontend responses.

## Verification

- Fresh PostgreSQL Social contract: tenant-isolated channels/conversations,
  credential-field schema denial, CSRF-protected open/read, foreign-reference
  rejection, idempotent enqueue, exact-once local provider acceptance, and
  bounded analytics.
- Provider unit contract: accepted receipt, definite client rejection, and
  ambiguous network/5xx/missing-receipt outcomes.
- Frontend adapter contract: retained snake-case shapes, pagination, explicit
  null clearing, mutation routing, and analytics mapping.
- Meta webhook PostgreSQL contract remains green for signature verification,
  duplicate delivery, Facebook/Instagram routing, overflow draining, and
  reconciliation.
