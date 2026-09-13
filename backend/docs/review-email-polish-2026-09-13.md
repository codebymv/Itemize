# Review email CTA and delivery visibility

Implemented and verified in production on commit 700a8318. One fresh app-generated QA email confirmed the canonical button, shared branded layout and provider-confirmed delivery label. The preceding baseline journey is documented in review-email-live-journey-2026-09-13.md.

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

## Production verification

Verified on 2026-09-13. CI run 34782226290 passed. Railway frontend deployment d73f47fd-322d-4256-9801-6f8eb8641a5d and backend deployment 7636b4d0-6141-4e00-a49b-58611aad725b both succeeded on 700a831879b6080295ab8f6437cce6cdd6a3d6b5. At 22:29 UTC the readiness endpoint, frontend HTML and deployed entry asset returned 200; the unsigned billing webhook correctly returned 400 for a missing signature. No schema migration was required.

One fresh single review request was sent through the production app to the authorized Itemize QA Launch contact, codebymv@gmail.com. The clearly labeled QA custom message deliberately contained https://example.com before the generated review-link suffix. No resend, SMS, public review submission or direct provider send was performed.

- Organization 14, review request 2, delivery 2; one delivery attempt, sent at 2026-09-13T22:32:23.156Z.
- Provider message d5f835b6-305d-41f5-82e0-8003d74724fa: Resend read-only retrieval returned 200 and last_event delivered; the persisted receipt also reported delivered.
- The stored receipt uses the authenticated v1 encrypted format. Decrypting it produced HTML identical to the provider-retrieved HTML.
- The canonical review URL appeared exactly once in the HTML, as the button target. The plain-text alternative retained the review URL. The HTML omitted the generated raw-link label, preserved the custom text, and did not use example.com as the button target.
- Shared-shell logo URL, blue accent, slate background, white card and Raleway font tokens were present. Desktop Gmail visually displayed the branded card, logo, blue button and muted footer without the redundant raw review URL. Yellow text highlights in the inspected view came from Gmail search.
- The new app card initially showed Sent, then displayed Email delivered without a manual page reload. The older request also displayed its existing provider-confirmed delivery evidence after loading the new frontend.

This verifies the new production email path and desktop Gmail rendering. Mobile inbox rendering and other email clients were not checked in this pass.
