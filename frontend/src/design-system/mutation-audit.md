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
| Billing | Checkout / customer portal | Organization- and payload-scoped single-flight; confirmed session retained across navigation retry | Required caller idempotency key | Stripe session navigation is isolated from session creation |
| Admin communications | Operational email batch | Authored payload-scoped single-flight; close and template navigation guarded while unresolved | Required caller idempotency key | Confirmed batch remains confirmed if follow-up UI work fails; replay is surfaced explicitly |
| Calendar integrations | Queue account sync | Connection-row-owned single-flight; separate accounts remain independent | Required caller idempotency key | Existing active job is surfaced as recovery; confirmed queue result is isolated from follow-up UI work |
| Workspace | Move and resize canvas items | Latest absolute position wins; batches serialize and unchanged ambiguous retries retain one attempt | Caller-owned realtime mutation ID; absolute writes are safe to repeat | Newer queued movement cannot be replaced by stale retry data |
| Workspace | Revoke a public share | Dialog-scoped single-flight; close is guarded and an unchanged retry retains one attempt | Caller-owned realtime mutation ID; revocation is an idempotent absolute-state write | Owning workspace row is patched only after confirmation |

## Workspace mutation classification

Workspace `mutationId` values currently deduplicate realtime outbox events. They
are not durable business-operation receipts and must not be described as
idempotency keys. Moving an ID into the browser is appropriate only when the
underlying write is itself safe to repeat.

| Action | Current write model | Attempt ownership |
| --- | --- | --- |
| Create list, note, whiteboard, or wireframe | Non-idempotent insert with no client request token | UI single-flight only. A lost response requires reconciliation or a future durable creation receipt before retry. |
| Update list | Optimistic, serialized per list, and revision fenced | Transport creates a realtime event ID for each committed queued edit. Do not retain it across a conflict. |
| Update note | Optimistic last-write update without a revision fence | Transport event ID remains per request. Ambiguous completion requires snapshot reconciliation before retry. |
| Update whiteboard or wireframe | Serialized per entity and revision fenced | Transport event ID remains per committed revision attempt. A stale revision must reconcile rather than replay blindly. |
| Delete workspace content | Destructive and not replayable after the row is gone | UI must single-flight, then reconcile an ambiguous failure against the workspace snapshot. A durable deletion receipt is required before calling this idempotent. |
| Enable sharing | Returns the entity's stable public token | Safe to repeat, but no realtime mutation ID is accepted by this contract. |
| Disable sharing | Absolute `is_public = false` transition | Share UI owns one stable mutation ID across an unchanged retry. |
| Move or resize canvas content | Debounced absolute coordinates; newest value supersedes older values | Position-sync UI owns one ID per canonical batch and retains it only while the batch is unchanged. |

## Remaining migration queue

1. Add durable creation/deletion receipts, or explicit snapshot reconciliation,
   before treating ambiguous workspace create and delete failures as retryable.
2. Reconcile ambiguous note, whiteboard, and wireframe updates against the
   workspace snapshot; their realtime mutation IDs are not result receipts.
3. Convert remaining manual `saving`, `sending`, and `deleting` handlers to the
   same pending and `aria-busy` contract as their surrounding primitives.

## Review test

For every new mutation, answer these questions before merge:

1. Can touch, click, or keyboard events start it twice before the UI rerenders?
2. If the response is lost, can the exact payload be retried without repeating
   the business effect?
3. Does a confirmed result remain confirmed if a follow-up refresh fails?
4. Which source cache is patched, and which derived keys are invalidated?
5. Does the error message distinguish rejected, unchanged, and unconfirmed?
