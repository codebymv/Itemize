# Mutation lifecycle audit

This audit treats mutation behavior as part of Itemize's design system. It
covers duplicate submission, retry safety, pending feedback, failure recovery,
and cache ownership. The visual control and the server outcome are one user
story; neither layer is sufficient by itself.

## Enforced baseline

- React Query mutations do not retry globally.
- Mutation controls expose one pending state and remain disabled while work is
  unresolved. High-impact handlers also use an immediate single-flight lock so
  two click, touch, or Enter events cannot start concurrent work before React
  rerenders.
- `useStableMutationKey` keeps one server idempotency key for an unchanged
  attempt, releases it for a safe retry after an ambiguous failure, and rotates
  it after a confirmed outcome, payload change, or explicit cancel.
- A confirmed business mutation is separated from follow-up reads. A delayed
  Inbox refresh cannot turn an accepted delivery into a false “not sent” state.
- Returned source entities patch their owning state or cache. Only derived
  lists, counts, and route snapshots are invalidated.

## High-impact coverage

| Surface | Action | Browser lifecycle | Server boundary | Derived state |
| --- | --- | --- | --- | --- |
| Campaigns | Send campaign / send test | Single-flight, stable unchanged retry, pending and cancel guard | Caller idempotency key | Campaign bootstrap patched; campaign queues and Dashboard snapshot invalidated |
| Inbox | Email, SMS, social, and chat reply | One attempt across every external channel | Caller idempotency key | Conversation refresh isolated from delivery result; list refreshed |
| Inbox composer | New email or SMS | Payload-scoped attempt; close blocked while sending | Caller idempotency key | Owning conversation opened after queue confirmation |
| Contacts | Compose email | Payload-scoped attempt and guarded modal close | Caller idempotency key | Owning callback runs only after confirmation |
| Reputation | Single and bulk request | Shared primitive replaces the former local implementation | Caller idempotency key | Request list callback runs after the retained result |
| Invoices | Send / resend | Invoice and authored email payload identify the attempt | Caller idempotency key | Invoice list refreshed after confirmed delivery |
| Invoices | Create payment link | One attempt per invoice while the modal is active | Caller idempotency key | Returned link remains local to the modal |
| Estimates | Send from list or editor | One pending send and stable unchanged retry | Caller idempotency key | List refreshed or editor status patched |
| Recurring invoices | Generate now | One attempt per template | Caller idempotency key | Recurring pages, preview, and Dashboard snapshot invalidated |
| Payments | Refund | Existing dialog-scoped key is retained across retry | Required caller idempotency key | Payment and aggregate views refresh after provider result |

## Remaining migration queue

1. Billing checkout and portal session creation still mint keys inside the
   service. Move attempt ownership to the initiating subscription UI so a lost
   response can be retried against the same request.
2. Admin operational email delivery still creates its key inside the GraphQL
   adapter. Reuse the shared attempt lifecycle in the communications composer.
3. Calendar integration sync accepts a caller key but should retain it in the
   integration row until the sync result is confirmed.
4. Workspace mutation IDs are still transport-generated. Classify each create,
   update, delete, and share path as optimistic, retryable, or reconciliation
   required before moving those IDs into UI ownership.
5. Convert remaining manual `saving`, `sending`, and `deleting` handlers to the
   same pending and `aria-busy` contract as their surrounding primitives.

## Review test

For every new mutation, answer these questions before merge:

1. Can touch, click, or keyboard events start it twice before the UI rerenders?
2. If the response is lost, can the exact payload be retried without repeating
   the business effect?
3. Does a confirmed result remain confirmed if a follow-up refresh fails?
4. Which source cache is patched, and which derived keys are invalidated?
5. Does the error message distinguish rejected, unchanged, and unconfirmed?
