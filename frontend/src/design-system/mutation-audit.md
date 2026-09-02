# Mutation lifecycle audit

This audit treats mutation behavior as part of Itemize's design system. It
covers duplicate submission, retry safety, pending feedback, failure recovery,
and cache ownership. The visual control and the server outcome are one user
story; neither layer is sufficient by itself.

## Enforced baseline

- React Query mutations do not retry globally.
- The retained Axios transport retries safe reads only. Writes never replay an
  ambiguous network failure unless that call explicitly opts in and its server
  boundary durably deduplicates the request. GraphQL mutations likewise have
  no generic network retry loop.
- Mutation controls expose one pending state and remain disabled while work is
  unresolved. High-impact handlers also use an immediate single-flight lock so
  two click, touch, or Enter events cannot start concurrent work before React
  rerenders.
- `useSingleFlightAction` is the browser-only primitive for create, update, and
  destructive controls that do not already own a stable server mutation key.
  It couples the immediate lock to rendered pending state and guards dialog
  dismissal until the action settles; it does not replace server idempotency.
- `useKeyedSingleFlightAction` provides the same admission guarantee for lists,
  queues, and boards. Actions targeting one entity serialize, while unrelated
  rows remain independently interactive.
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
| Campaign editor | Save, schedule, unschedule, pause, resume, duplicate, and delete | One resource-wide immediate lock; delivery keys are acquired inside their owning attempt | Existing campaign endpoint contracts; send and test retain caller idempotency | Confirmed campaign state patches the editor bootstrap before derived invalidation |
| Inbox | Email, SMS, social, and chat reply | One attempt across every external channel | Caller idempotency key | Conversation refresh isolated from delivery result; list refreshed |
| Inbox composer | New email or SMS | Payload-scoped attempt; close blocked while sending | Caller idempotency key | Owning conversation opened after queue confirmation |
| Contacts | Compose email | Payload-scoped attempt and guarded modal close | Caller idempotency key | Owning callback runs only after confirmation |
| Reputation | Single and bulk request | Shared primitive replaces the former local implementation | Caller idempotency key | Request list callback runs after the retained result |
| Invoices | Send / resend | Invoice and authored email payload identify the attempt | Caller idempotency key | Invoice list refreshed after confirmed delivery |
| Invoices | Create payment link | One attempt per invoice while the modal is active | Caller idempotency key | Returned link remains local to the modal |
| Estimates | Send from list or editor | One pending send and stable unchanged retry | Caller idempotency key | List refreshed or editor status patched |
| Recurring invoices | Generate now | One attempt per template | Caller idempotency key | Recurring pages, preview, and Dashboard snapshot invalidated |
| Payments | Refund | Existing dialog-scoped key is retained across retry | Required caller idempotency key | Payment and aggregate views refresh after provider result |
| Payments | Record payment and manage business profiles | Independent immediate locks for settings, payment creation, refund, and business-profile writes; dialogs cannot dismiss mid-write | Existing create/update contracts; refunds retain caller idempotency | Settings and business sources patch directly; payment aggregates refresh after confirmation |
| Billing | Checkout / customer portal | Organization- and payload-scoped single-flight; confirmed session retained across navigation retry | Required caller idempotency key | Stripe session navigation is isolated from session creation |
| Admin communications | Operational email batch | Authored payload-scoped single-flight; close and template navigation guarded while unresolved | Required caller idempotency key | Confirmed batch remains confirmed if follow-up UI work fails; replay is surfaced explicitly |
| Calendar integrations | Queue account sync | Connection-row-owned single-flight; separate accounts remain independent | Required caller idempotency key | Existing active job is surfaced as recovery; confirmed queue result is isolated from follow-up UI work |
| Calendar integrations | Connect or disconnect providers | One integration-wide immediate lock with provider-specific busy feedback | Existing OAuth and absolute disconnect contracts | Integration overview is patched only after confirmed disconnect |
| Core create/edit dialogs | Contacts, pipelines, bookings, calendars, SMS templates, and workspace content | Shared immediate single-flight state, pending semantics, and guarded dismissal | Existing resource endpoint contract; externally visible effects still require server idempotency when introduced | Returned entity remains the owning page's source update |
| Resource catalogs | Pages, forms, calendars, automations, campaigns, email templates, and SMS templates | Resource-keyed immediate locks cover create, publish/status, duplicate, test, pause/resume, and delivery callbacks; unrelated rows remain concurrent | Existing endpoint contracts | Confirmed rows patch local preview state or invalidate the narrow owning catalog |
| Operational queues and boards | Bookings, review requests, signature documents, connected social accounts, pipeline deals, and page versions | Resource-keyed locks cover independent row actions; page-version writes use one page-wide lock because publish, restore, create, and delete share a current-version invariant | Existing endpoint contracts | Source queues refresh only after the admitted action settles; optimistic deal moves roll back from the captured source cache |
| Full-page editors | Pages, automations, chat and reputation widgets, segments, SMS templates, estimates, organization settings, products, and recurring schedules | One editor-wide single-flight owner prevents save, status, conversion, or create actions from racing before rerender | Existing resource endpoint contract; stable delivery keys remain inside the editor lock | Confirmed entities patch source state or the owning query cache before derived invalidation |
| Email template studio | Save draft, publish, and send test | One studio-wide lock with action-specific pending copy; nested draft persistence runs inside the owning publish or test attempt; an unchanged publish retains its key after an ambiguous failure | Publish uses a template-scoped durable receipt and request fingerprint; test delivery retains its existing delivery key | Draft/catalog state is patched before navigation; publish and test cannot race a save |
| Automation runs | Enroll, pause, resume, retry, and cancel | One workflow-run lock with row-specific busy semantics and guarded parent/confirmation dismissal | Existing workflow enrollment transitions | Enrollment, contact eligibility, and automation queue queries refresh together |
| Signature documents | Draft creation, save, upload, send, remind, retry, cancel, delete, and template instantiation | One document- or catalog-wide immediate lock; send and delete dialogs cannot dismiss mid-write | Existing signature endpoint contracts | Document detail/catalog caches patch before list invalidation or navigation |
| Public completion routes | Book/cancel appointment, submit form/review/signature, accept/decline estimate | Immediate single-flight admission with action-specific pending feedback; public bookings and forms retain one payload-scoped key across ambiguous retries; estimate confirmation remains owned until settlement | Booking creation and form submission use resource-scoped durable keys and payload fingerprints; booking cancellation capabilities are deterministically recoverable without storing raw tokens; remaining routes retain their existing public capability and terminal-state contracts | Terminal success replaces the interactive state only after confirmation |
| Public chat widget | Start or resume a session, send a visitor message, and end a session | The embed owns one immediate attempt at a time, keeps one key for an unchanged retry, restores failed message input, and retries only replay-safe network ambiguity | Session starts and visitor messages use resource-scoped durable receipts and payload fingerprints in the same transaction as counters, inbox mirroring, and notifications; end-session is an absolute transition whose successful replay does not repeat realtime effects | Confirmed responses replace optimistic visitor messages by server identity; exact replays return the original session or message |
| Contacts | Bulk tag update | Immediate single-flight and guarded modal dismissal | Existing bulk contact update contract | Owning contact list refreshes only after confirmation |
| Contacts | CSV import | One payload-scoped attempt owns the modal through settlement; duplicate click, touch, and Enter admission is rejected before the importing step renders, while an ambiguous retry retains its key | Required caller idempotency key; the receipt, imported contacts, workflow triggers, and contact activities commit in one tenant-serialized transaction, and conflicting key reuse fails closed | Import results and the owning contact refresh occur only after the admitted batch returns; confirmed replays do not repeat onboarding effects |
| Account | Schedule permanent deletion | Shared immediate single-flight state; confirmation cannot dismiss while unresolved | Authenticated account-deletion boundary retains its existing preflight and recovery contract | Auth is cleared and navigation occurs only after confirmed scheduling |
| Account and administration | Plan change, checkout/trial start, organization switch, and Stripe connect/disconnect | Shared immediate locks close pre-render admission gaps; related Stripe commands share one resource owner | Existing subscription, organization, and provider contracts | Authoritative entitlement or integration refresh must confirm completion before success is surfaced |
| Workspace | Move and resize canvas items | Latest absolute position wins; batches serialize and unchanged ambiguous retries retain one attempt | Caller-owned realtime mutation ID; absolute writes are safe to repeat | Newer queued movement cannot be replaced by stale retry data |
| Workspace | Revoke a public share | Dialog-scoped single-flight; close is guarded and an unchanged retry retains one attempt | Caller-owned realtime mutation ID; revocation is an idempotent absolute-state write | Owning workspace row is patched only after confirmation |
| Workspace | Delete list, note, whiteboard, wireframe, or vault | Shared dialog acquires an immediate single-flight lock before React rerenders | Ambiguous failures are checked against an exact user-scoped content identity; absence confirms the requested outcome | Owning UI removes content only after deletion or authoritative absence is confirmed |
| Workspace | Autosave note, whiteboard, or wireframe | Note autosave coalesces to the latest value, follows an in-flight save with the newest edit, and flushes pending content on unmount; canvases cancel their debounce and flush pending data on hide/unmount while same-entity transports serialize revisioned writes | Deterministic failures do not reconcile; ambiguous failures read one exact user-scoped record and confirm only when every intended field matches | The authoritative record becomes the confirmed result and advances whiteboard or wireframe revision state without allowing an older edit to overtake a newer queued value |
| Workspace | Create list, note, whiteboard, or wireframe | Equal payloads share one in-flight request; ambiguous failures retain the attempt key and local insertion is identity-deduplicated | User-scoped durable receipt fingerprints the normalized payload and commits the resulting entity ID in the insert transaction | A retry replays the original entity; key reuse for different content is rejected |
| Workspace cards | Clear whiteboard, bulk-import vault entries, and change card/category colors | Explicit commands use immediate single-flight admission and disable related controls; whiteboard clear cancels any stale scheduled autosave before persisting the empty canvas; category preview and save no longer duplicate one server write | Existing workspace update contracts and revision queues | Confirmed updates continue through each card's owning source callback; autosave remains a separate latest-value pipeline |

## Workspace mutation classification

Workspace `mutationId` values currently deduplicate realtime outbox events. They
are not durable business-operation receipts and must not be described as
idempotency keys. Moving an ID into the browser is appropriate only when the
underlying write is itself safe to repeat.

| Action | Current write model | Attempt ownership |
| --- | --- | --- |
| Create list, note, whiteboard, or wireframe | Non-idempotent insert protected by a durable creation receipt | The browser retains one key for an unchanged ambiguous attempt. The server transaction claims `(user, key)`, fingerprints normalized content, records the resulting identity, and replays it on retry. |
| Update list | Optimistic, serialized per list, and revision fenced | Transport creates a realtime event ID for each committed queued edit. Do not retain it across a conflict. |
| Update note | Optimistic last-write update without a revision fence | Transport event ID remains per request. Ambiguous failures read the exact note and succeed only when every intended field matches; otherwise the original failure remains. |
| Update whiteboard or wireframe | Serialized per entity and revision fenced | Transport event ID remains per committed revision attempt. Ambiguous failures reconcile exact canonical canvas or flow content and return the authoritative revision only on a complete match. |
| Delete workspace content | Destructive and not replayable after the row is gone | UI single-flights the attempt. A failed transport is reconciled through an exact user-scoped identity query; confirmed absence satisfies the delete intent, while a present or unverifiable row preserves the original failure. This is outcome reconciliation, not mutation idempotency. |
| Enable sharing | Returns the entity's stable public token | Safe to repeat, but no realtime mutation ID is accepted by this contract. |
| Disable sharing | Absolute `is_public = false` transition | Share UI owns one stable mutation ID across an unchanged retry. |
| Move or resize canvas content | Debounced absolute coordinates; newest value supersedes older values | Position-sync UI owns one ID per canonical batch and retains it only while the batch is unchanged. |

## Remaining migration queue

1. Add durable server idempotency to remaining non-idempotent create and publish
   boundaries that are currently protected only against concurrent browser
   events. `useSingleFlightAction` deliberately does not claim replay safety
   after a lost response.

## Review test

For every new mutation, answer these questions before merge:

1. Can touch, click, or keyboard events start it twice before the UI rerenders?
2. If the response is lost, can the exact payload be retried without repeating
   the business effect?
3. Does a confirmed result remain confirmed if a follow-up refresh fails?
4. Which source cache is patched, and which derived keys are invalidated?
5. Does the error message distinguish rejected, unchanged, and unconfirmed?
