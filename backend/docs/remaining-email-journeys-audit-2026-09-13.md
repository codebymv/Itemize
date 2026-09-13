# Remaining email journeys: failure-handling audit

Repository audit of booking confirmation/reschedule/cancellation, estimates and responses, review requests, trial reminders and workflow email. This pass used source review and local regression tests; it did not generate production mail or verify these journeys visually in a recipient inbox. SMS and backup/restore remain out of scope.

## Findings by journey

| Journey | Rendering and queue | Provider outcome / operations | Remaining gap |
| --- | --- | --- | --- |
| Booking lifecycle | booking-notification.ts builds brandedTransactionalEmail and enqueues a snapshot in the booking transaction | Workflow outbox records provider ID and creates email_logs; shared webhook matcher can update that log; workflow admin queue exposes failures | Expired processing claims can still be reclaimed without a persisted first-send deadline; wire sender is read at send time |
| Workflow email | workflow-enrollment.util.ts wraps fragments with renderEmailTemplateDocument; full HTML is passed through | Same outbox/log and fenced completion as bookings | Full-HTML passthrough does not enforce the shared shell; same retry-window and complete wire-snapshot gap |
| Estimate send/response | brandedTransactionalEmail; estimate_email_deliveries payload snapshot and stable idempotency key | Provider ID stored in outbox; estimates admin queue exposes reconciliation/dead-letter | Outbox is not a normal delivery-outcome webhook target; rendering is repeated per attempt; completion/failure writes lack attempt-generation fencing |
| Review requests | brandedTransactionalEmail; review_request_deliveries snapshot and stable email key | Provider ID stored in outbox; review-request admin queue exposes failures | Outbox is not a normal delivery-outcome webhook target; shell and sender are reconstructed; completion/failure writes lack attempt-generation fencing |
| Trial reminders | brandedTransactionalEmail; trial_reminder_deliveries snapshot and stable organization/trial key | Completion creates email_logs, enabling shared webhook matching; claim completion/failure is fenced | Previously omitted from admin queue inventory; no persisted provider-first-attempt deadline; renderer uses current config |

The classifier's checks for estimate/review outbox ownership prevent incorrect other-app classification but do not themselves record delivered/bounced outcomes. Likewise, a provider acceptance receipt is not proof of inbox delivery.

## Fixed in this pass

All four Resend adapters (booking uses the workflow adapter) previously allowed a successful HTTP response with no receipt ID to mark work sent. A shared response boundary now rejects missing, empty, non-string or oversized receipt IDs as unknown acceptance. HTTP 5xx and 409 responses also require review instead of being treated as definite rejection. Existing definite rejection handling, including rate-limit behavior, remains in each provider.

Booking/workflow network failures now carry an explicit unknown-outcome flag. The outbox failure handler quarantines uncertain email alongside its existing uncertain-SMS handling. It also requests reconciliation when database persistence fails after the email provider returned acceptance, rather than treating that as an ordinary send retry. Existing attempt fencing and cancellation precedence remain intact.

Trial transport/receipt ambiguity now uses a non-retryable error, routing the existing worker to dead_letter. A persistence exception after acceptance also prevents automatic retry. The admin operations registry now includes trial-reminders so these cases are visible for operator review. No new statuses or database migration are required for this initial pass. Estimate services route thrown ambiguous provider outcomes to reconciliation_required. Correction from the follow-up audit: review-request email exceptions still retried; only SMS exceptions requested reconciliation. The follow-up below fixes that gap.

Follow-up implementation: [Durable recovery for remaining email journeys](remaining-email-durable-recovery-2026-09-13.md). It extends encrypted receipts and webhook matching to these sources; the findings table above describes the initial audit baseline.

These changes prevent the observed classes of false success and unsafe automatic retries. They do not yet provide the complete invoice/signature durable wire-payload and bounded retry-window model for every journey, particularly a process crash between provider acceptance and persistence.

## Next implementation priorities

1. Extend durable receipt/payload protection to these send paths, preserving existing keys and original first-attempt times. Handle already-attempted legacy rows conservatively. Test a process crash and recovery after the provider deduplication window.
2. Fence estimate/review completion and failure writes against stale attempts, then connect their receipts to provider outcome matching and user-facing delivery status.
3. Decide how explicitly custom full-HTML workflow templates should interact with the shared design system, then visually verify all five journeys at desktop/mobile email widths through real app-generated QA sends.

## Release status

Committed and deployed as c6de5281e1f84eabe3c7932d8e0349470f7ba511. Existing production-classification verification notes are preserved.

Validation passed: 23 focused unit tests across receipt validation and estimate/review/workflow providers and workers; 29 fresh PostgreSQL integration tests across workflows, trial reminders and admin operations; all 10 release contracts; backend build; documentation and diff checks. The fresh database verified 168 required tables and 163 migration markers. No new live email was sent.

## Production verification - 2026-09-13 18:49 UTC

GitHub CI run 34775168655 passed. Railway frontend deployment 52e98087-91d5-46c1-8107-768b21056eb1 and backend deployment 6dac2850-c1ae-4a4d-bd91-e6519cc32ff1 both report SUCCESS on c6de5281, with one active deployment per service. API readiness, frontend HTML and its script return 200; an unsigned billing webhook returns 400.

The backend runtime confirms the release commit and enabled workflow, trial-reminder, estimate-email, reputation-request and email-webhook worker flags. A read-only call to the deployed admin operations repository reports estimates, review-requests, workflows, trial-reminders and email-webhooks available, each with zero queued, processing, retrying or action-required jobs. This confirms the newly registered trial-reminder queue against production data.

QA invoice delivery 6 and signature delivery 8 remain delivered with their original provider timestamps; each send job still has attempt_count=1. Verification generated no new email and injected no provider failures into production. The uncertainty handling is exercised by the regression suites above; healthy empty queues do not independently prove those failure paths.
