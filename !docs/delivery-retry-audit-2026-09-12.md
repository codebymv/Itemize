# Invoice and signature retry audit - 2026-09-12

## Scope

Verified production avatar release a3d81d87, then reviewed invoice/signature send, retry, lease recovery, provider idempotency, user feedback, and allowance behavior. This is a focused failure-path audit, not certification of all modules. Provider faults and races were tested in disposable PostgreSQL with stubbed delivery/payment providers; no live invoice, signature, payment or email was sent.

## Production release evidence

- CI 34679538846 succeeded: https://github.com/codebymv/Itemize/actions/runs/34679538846.
- API deployment 800e63ef-e2bf-407e-b915-ad69009ccb40 and frontend fc6413e2-1e26-40be-a25b-388a57919ec1 both SUCCESS on a3d81d876beb7b1d8b709cfb0cac84c8707f1c85.
- API log confirms user_avatar_v1 completed; migration gate verified 161 markers and 166 required tables.
- Public API ready, frontend and its referenced JavaScript return 200; unsigned billing webhook returns 400.
- Existing signed-in QA account: selected Dawn, observed Saved, reloaded and confirmed Dawn still selected; visually confirmed header and member-row artwork. Restored Initials and confirmed Saved. This proves persistence across session hydration, not a separate logout/login or second-user visibility test. The open tab initially ran the old bundle until reloaded.

## Findings

### P1: stale invoice delivery writes - corrected locally

`InvoicesRepository.recordPaymentLink`, `completeEmailDelivery`, and `failEmailDelivery` previously lacked claim-attempt checks. After a 60-second lease expired and another worker claimed the row, an old callback could overwrite payment-link evidence, complete the wrong attempt, or change a confirmed sent receipt back to retry/reconciliation_required.

All three writes now require the current processing attempt. Stale link persistence returns no claim and stops the service before PDF/email delivery. Stale completion/failure returns the authoritative current receipt without changing it. Activation only records a sent result. No schema change is required. This fences database effects; it is not a claim of exactly-once external delivery.

Fresh PostgreSQL regression covers active-lease exclusion, forced expiry and reclaim, rejected stale link/success/failure, correct second-attempt completion, and a late failure after confirmed delivery. Focused service tests cover stopping after lost link ownership and avoiding activation for a superseded completion.

### P1: long-outage provider deduplication is not bounded - corrected locally

Signature jobs reclaim expired leases and retry thrown provider errors with the same idempotency key. Manual retry requeues dead-letter work without a first-provider-attempt deadline. Invoice processing rows can also be reclaimed long after a crash even though ordinary thrown send errors are quarantined.

Resend retains keys for 24 hours and requires the same request payload: https://resend.com/docs/dashboard/emails/idempotency-keys. If provider acceptance occurs before a process crash and the local receipt is not committed, recovery after that window can send another email. This is a code-path risk supported by the provider contract, not an observed duplicate in production. Invoice PDFs and rendered MIME are regenerated at attempt time, so byte-for-byte retry payload stability also needs explicit coverage.

Implemented: durable provider receipts save the first attempt time and encrypted exact wire payload, including attachment bytes. Retries use that payload and stop after 23 hours, leaving safety headroom under Resend's 24-hour window. A saved provider ID short-circuits another provider send. Admin reconciliation verifies the Resend ID, delivery-specific tag, recipients, subject and provider event before recording acceptance; it does not send email or authorize a blind new delivery.

### P1: signature manual retries reuse attempt numbers - corrected locally

Signature acknowledgement uses `status=processing AND attempt_count=<claim>`, but `SignatureDeliveryRepository.retryFailures` resets attempt_count to zero. A late worker from a prior retry cycle can match a new attempt with the same number. Completion jobs are reset similarly and should be reviewed in the same correction.

Implemented: both signature delivery and completion jobs now increment a separate claim_generation. Acknowledgement and failure writes match that generation. A fresh PostgreSQL regression resets the attempt budget through manual retry, then proves the old generation cannot acknowledge or fail the new claim even when attempt counts match.

### P1: uncertain invoice outcomes lack a complete recovery journey - corrected locally

`InvoiceEmailDeliveryService` stops on reconciliation_required and dead_letter, and new keys cannot bypass an unresolved delivery. This is appropriately conservative. However, the frontend adapter throws a generic error containing the status and discards deliveryId; the admin operations resolver exposes queue reads but no invoice reconciliation action.

Implemented: an organization-scoped query recovers the latest durable receipt from both list and editor send dialogs. Loading failures and unresolved receipts block a new send. Safe retry addresses the original delivery ID, never a new request: repeated retry calls converge on that receipt. The admin queue offers provider verification with an actor-attributed audit record. Provider acceptance is distinct from inbox delivery. Shared Button, Input, Label, theme tokens, GraphQL client, Query and single-flight conventions are retained.

### P2: invoice editor omits the payment-link choice - corrected locally

`useInvoiceSave.handleSendInvoice` forwards subject/message/CC but omits `options.includePaymentLink`, unlike InvoicesPage. The shared send dialog offers this control. The editor now forwards the selected option, with true/false regression coverage. Both active send entry points pass their real invoice ID to the shared recovery panel, independent of preview data loading. The older useInvoiceActions send helper also lacks a stable key but has no current importer; it is not classified as an active production bypass.

## Existing safeguards verified

- Transactional invoice enqueue, same-key replay and changed-payload conflict; unconfirmed PDF/provider failures leave invoices unsent; fresh keys cannot bypass unresolved sends.
- Signature first-send allowance serializes the last monthly slot; drafts are unmetered and reminders/retries do not consume a second slot. Terminal public signing actions and sequential signers remain covered.
- Duplicate invoice payment events converge on one payment; late Checkout expiration does not overwrite a newer outcome.
- Shared branded transactional email renderers remain in both delivery paths. This pass did not send another live brand-validation email.

## Validation and release status

Fresh PostgreSQL invoice/signature integration: 42 tests passed after the recovery migration, including immutable retry payload, expired-window refusal, unrelated provider evidence rejection, reconciliation replay, tenant/admin boundaries and signature manual-retry generation fencing. The earlier invoice webhook suite also passed unchanged. Fresh schema initialization verified 162 migration markers and 168 required tables.

Final validation: 999 backend tests (202 suites) and 1,429 frontend tests (321 files) passed. release:check passed all 10 contract tests, both production builds and every bundle budget. Frontend lint passed with zero errors and 55 existing warnings. Documentation synchronization/check and git diff --check passed. Browser visual QA used actual recovery components in an isolated local fixture at 375px width in light/dark themes, including expanded admin review. No provider send occurred in that fixture. This was component visual QA, not an end-to-end production recovery exercise.

Changes remain local, uncommitted and undeployed. Verified production remains a3d81d87.

## Deployment and operator runbook

1. Deploy migration 083 and the API/worker code as one coordinated release. Stop/drain old invoice and signature workers before enabling the new version; old binaries do not enforce the new provider-receipt checks. Do not allow a mixed-version worker overlap and claim the new guarantees.
2. The encrypted snapshots reuse the application's CALENDAR_TOKEN_ENCRYPTION_KEYS and CALENDAR_TOKEN_ACTIVE_KEY_ID keyring, with separate delivery-specific authenticated encryption context. Both settings were confirmed present on the production API without printing values. Verify the same keyring on any separate worker services. Keep prior decryption keys while their receipts remain retained. Payloads contain personal data and signature links; do not log or export decrypted snapshots.
3. Migration conservatively marks existing attempted, unresolved deliveries for review because their original provider payload/acceptance cannot be proven. Legacy rows lacking a saved payload/tag cannot be resolved through the new verifier. Leave them paused and review original provider logs/customer evidence through support; do not clear flags or blindly replay them. This release does not provide an automatic legacy-backlog resolution or a manual 'definitely not sent' override.
4. For a new uncertain delivery, use its durable delivery number. Within the safe window the invoice dialog may offer Retry original email. Outside it, leave the receipt paused. In Admin Operations, locate the invoice/signature receipt, expand Review delivery, and enter its Resend email ID. The server verifies evidence before recording acceptance. An unrelated/shared-account email is rejected. Active worker leases must finish or expire first.
5. Reconciliation records provider acceptance, including an email whose later event is bounced/failed/suppressed. It does not assert inbox delivery or clear bounce statistics. Cancellation remains cancelled even when provider evidence is retained.
6. After deployment, verify health, migration marker, worker ownership, an authorized QA send and receipt status after reload. This local pass did not induce live provider failures, send new email, or test production reconciliation.

Encrypted snapshots are retained with their organization (cascade deletion); this package does not add a timed retention purge. PDF rendering still occurs before the provider adapter on normal worker retries, so an unavailable renderer can delay completion even when a provider receipt exists; explicit admin reconciliation can resolve verified acceptance.

SMS and backup/restore remain out of scope. Full logout/login, second-user avatar visibility, long-running live provider fault injection, and every product module are not claimed as verified here.
