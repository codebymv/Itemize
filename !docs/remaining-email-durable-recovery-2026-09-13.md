# Durable recovery for remaining email journeys

## Scope and status

Deployed as db39649b; Railway deployment success verified on 2026-09-13. Booking/workflow email, estimate send/response, review-request email and trial reminders now use the existing invoice/signature encrypted provider-receipt mechanism. No production emails were sent. SMS and backup/restore remain out of scope.

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

Release update at 2026-09-13 19:53 UTC: GitHub CI run 34777554083 completed successfully. Both Railway deployments listed below now report SUCCESS on db39649b. Runtime receipt/backfill and queue inspection remain separate follow-up checks; deployment success alone does not verify every delivery journey.

Release check at 2026-09-13 19:32 UTC: db39649b is pushed to master. GitHub CI run 34777554083 passed its contracts, lint, unit and integration steps and is still building. Railway frontend 2df438cf-cbda-4ed9-9697-4ad50640c7ec and backend d2abef16-682c-42ba-a832-06f1e0e11213 were last observed WAITING for CI. The currently serving API readiness, frontend HTML and script returned 200; the unsigned billing webhook returned 400. These health checks do not verify the pending release or migration in production.

Follow-up local implementation: [Estimate/review attempt fencing](estimate-review-attempt-fencing-2026-09-13.md). Extend operator reconciliation and user-facing delivery outcomes for these sources. Resolve the policy for custom full-HTML workflow templates, then visually verify real app-generated emails against the shared design system. This durable-receipt release does not claim those gaps are closed.
