# Durable recovery for remaining email journeys

## Scope and status

Implementation validated locally and prepared for release; production deployment verification is pending. Booking/workflow email, estimate send/response, review-request email and trial reminders now use the existing invoice/signature encrypted provider-receipt mechanism. No production emails were sent. SMS and backup/restore remain out of scope.

## Behavior

Each worker supplies its organization, source, delivery ID and claim attempt count. Before contacting Resend, the shared sender persists the complete encrypted wire payload, including sender, rendered HTML and correlation tag. Recovery reuses that payload and the original idempotency key. A persisted provider ID returns without another send; attempts without a provider ID stop after the existing 23-hour cutoff. Ambiguous provider acceptance or failure to persist an accepted receipt requires review through the worker's existing failure handling.

Review-request email now forwards unknown acceptance to reconciliation_required. Ordinary known failures retain their existing handling. This corrects the prior audit's claim that the email worker already quarantined these exceptions.

Shared webhook processing can record provider outcomes on receipts for all six sources. Ownership checks include each underlying email outbox, preventing a reused provider ID from silently crossing organizations. This adds backend evidence; it does not add estimate/review delivery-status UI or extend the invoice/signature operator reconciliation UI.

## Migration and rollout

Migration 085 expands receipt sources and backfills attempted legacy deliveries. Unique known provider IDs are preserved. Missing or conflicting IDs create review holds with no fabricated payload. Legacy creation time is a conservative cutoff reference, not a reconstructed send timestamp. Pending webhook events with a known receipt are made eligible for reconciliation again; active claims and ignored events remain unchanged.

The helper also holds a repeat claim with no receipt, covering an older runtime attempting work after the pre-deploy backfill. Existing receipts retain their original payload and first-attempt deadline. Fresh database validation reports 168 required tables and 164 migration markers.

Deploy the migration before the new backend starts. Verify worker flags, queue action-required counts and receipt/webhook outcomes after deployment. Legacy jobs with unknown acceptance may legitimately require review: do not blindly requeue them or create replacement sends. This change favors avoiding duplicate mail over automatic recovery when evidence is missing.

The migration's down operation preserves evidence. Before rolling application code back to an older worker implementation, stop the affected workers; old code does not enforce the new durable-send protections.

## Validation

- 29 focused unit tests passed across receipt validation, providers and worker error handling.
- 80 fresh PostgreSQL integration tests passed across remaining receipts, workflows, trial reminders, email webhooks and invoices.
- All 10 release contract tests, the backend build, environment contract, documentation sync/check and diff whitespace check passed.
- New integration cases cover encrypted payload replay after a lost response, unchanged sender/content despite subsequent input changes, cutoff enforcement, cached acceptance, receipt persistence conflicts, untracked repeat claims, repeatable legacy backfill, trial-key compatibility and cross-tenant webhook conflicts. Provider calls are mocked; no live delivery is implied.

## Remaining launch work

Fence estimate/review completion and failure writes against stale claim attempts. Extend operator reconciliation and user-facing delivery outcomes for these sources. Resolve the policy for custom full-HTML workflow templates, then visually verify real app-generated emails against the shared design system. This slice does not claim those gaps are closed.
