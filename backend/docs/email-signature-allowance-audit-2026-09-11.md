# Email and signature allowance audit ? 2026-09-11

## Findings and resolution

Campaign delivery previously reserved a calendar-month `usage_tracking` counter
using legacy `subscriptions` plan limits. Direct contact email incremented
`organizations.emails_used`; that counter reset only with Stripe billing periods,
including annual periods. Workflow email had no quota check. Settings displayed
only the direct-message counter. These were three independent allowance policies.

All three now use `billing/email-allowance.ts` and durable
`email_usage_reservations`, protected by one organization-specific advisory lock.
The current organization email limit is authoritative: -1 is unlimited, zero/null
permit no new metered email. Campaign batches reserve all recipients or none.
Direct contact messages reserve at enqueue; workflows reserve at first delivery
claim. A retry uses the existing source receipt, even in a later month. Accepted
reservations are not refunded for cancellation, bounce, failure or content deletion.
Monthly allowance is a UTC calendar month independent of Stripe invoice cadence.

Workflow capacity exhaustion leaves the outbox in retry with an explanatory error,
checks again after one minute, and does not consume a provider attempt. Paid-access
checks remain intact. Booking/form notifications use distinct server-generated
outbox keys and are excluded. Authentication, invoice, signature and other system
transactional delivery paths are unchanged. Existing test-send exemptions remain.
The metered workflow identity is the immutable `workflow-` idempotency-key prefix,
so deleting an enrollment cannot turn its queued email into an exempt notification.

Billing status and usage reconcile surviving current-month legacy outbox records,
then read the reservation ledger. Reconciliation is idempotent and also captures
old-runtime writes during rollout. Historical attempted workflow messages use
`sent_at`, or `created_at` when no successful send timestamp exists. Previously
deleted legacy source records cannot be reconstructed reliably from the conflicting
aggregate counters; no claim of complete historical usage reconstruction is made.
New reservation receipts survive source deletion. SMS accounting is unchanged.

## Signature decision

The owner explicitly selected **documents first sent** for Solo's 25/month allowance.
The initial-send transaction holds the existing organization advisory lock before
organization/document locks, rechecks paid access, validates the PDF/recipients,
checks the UTC `sent_at` count and atomically commits the delivery outbox and first
send timestamp. A successful request replay bypasses the quota check. A rejection
leaves the draft and its delivery state untouched. Draft creation/template
instantiation are unmetered; reminders/retries consume nothing additional. A
cancelled sent document continues counting; non-draft deletion remains prohibited.

## Schema and rollout

Additive migration 081 (`email_allowance_v1`) creates the durable receipt table and
indexes. Its down migration intentionally retains usage history. Production's
existing fail-closed migration gate must complete before the new API starts.
Rolling back application code reintroduces the old independent quota policies;
retained receipts are safe but an old binary is not an equivalent enforcement gate.

## Verification

Focused fresh-PostgreSQL tests pass for competing email producers, atomic batch
refusal, zero/unlimited limits, Settings parity, annual-plan monthly reset,
notification exemption, workflow deferral/resumption and retries across months.
Signature tests cover concurrent last-slot sends, a replay and reminder at the cap,
26 drafts at the cap, refusal without an outbox and next-month capacity recovery.
Existing campaign, direct-message, billing and workflow integration suites pass.
Full release gates and deployment verification are recorded separately under `tmp/`.
No real payment, SMS, or backup/restore operation is part of this pass.
