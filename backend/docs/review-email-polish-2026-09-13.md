# Review email CTA and delivery visibility

Implementation validated locally and prepared for release; production deployment verification is pending. No live email was sent in this implementation pass. The preceding live journey is documented in review-email-live-journey-2026-09-13.md.

## Changes

Single, bulk and resend producers now snapshot a canonical reviewUrl alongside the message. The email provider uses that URL for the button instead of selecting the first URL in customer-authored text. It removes the exact generated review-link suffix from the HTML body while retaining the plain-text alternative and thank-you copy. Custom content is still escaped and rendered inside the shared branded shell.

Older queued jobs without a reviewUrl obtain it from the tenant-scoped parent review request when claimed. This enriches the in-memory claim; it does not rewrite stored payloads or encrypted provider receipts. If a durable wire payload already exists, the shared sender replays those original bytes as before. Existing received emails are not retroactively changed.

ReputationRequest GraphQL results now include nullable emailDeliveryStatus from the latest email delivery for the request. Both delivery and receipt lookups are scoped to the organization. Selecting the newest delivery before evaluating its receipt prevents a previous delivered email from making a queued resend appear delivered. Requests with no provider evidence retain null.

The request card displays a separate provider label such as Email delivered, Email bounced or Email delivery failed alongside its existing response/status badge. It does not redefine customer states such as clicked/completed or claim delivery without evidence. Recently updated email requests with pending provider outcomes refresh every 15 seconds for at most ten minutes after the recorded request update; background polling remains disabled by TanStack Query's default behavior. Older requests refresh through the existing query/focus policy.

## Validation

- 17 backend unit tests passed across providers, delivery service and request repository/service behavior.
- 15 fresh PostgreSQL integration tests passed, including canonical/legacy URL behavior, tenant isolation, latest-resend evidence, public reputation regressions and unchanged durable payload replay.
- Five frontend tests passed across GraphQL mapping and rendered cards, including simultaneous Sent/Email delivered and Clicked/Email bounced labels and no invented delivery for unknown outcomes.
- Ten release contracts, backend build, final frontend build, bundle budgets, frontend lint and documentation/diff checks passed.

## Rollout

Deploy the backend before the frontend consumes the new GraphQL field. No schema migration is required. After deployment, repeat the authorized app-generated QA journey, inspect the canonical CTA in Gmail and confirm the app transitions from acceptance to the provider-confirmed label. This local validation does not claim a new production send or mobile inbox verification.
