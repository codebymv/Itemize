# Estimate and booking live email journeys

Verified against production 700a8318 on 2026-09-13, following the review-email production check. Four emails were generated through the normal signed-in Itemize UI to the authorized QA recipient codebymv@gmail.com: one estimate and three booking lifecycle notifications. No direct provider sends, duplicate sends, SMS, payments, estimate acceptance/decline or signatures were performed.

## Estimate

Created organization 14 estimate 31, EST-01007, for Itemize QA ? Email journey 2026-09-13. The total is USD 0.00 and its line item and notes explicitly identify QA-only verification with no services or payment requested. The send action changed the editor from Draft to Sent.

Delivery 13 was sent at 2026-09-13T22:39:02.286Z on attempt 1. Provider ID: 0d7c1011-6c96-42d1-ba58-e2e2fedd0f16. The durable receipt recorded delivered, and read-only Resend retrieval returned HTTP 200 with last_event delivered. The authenticated v1 encrypted receipt decrypted to HTML identical to the provider message. Shared logo, blue accent, slate background, white card and Raleway tokens were present; exactly one estimate CTA link appeared in the HTML.

Desktop Gmail visually showed the shared branded card, QA customer greeting, USD 0.00 amount, validity date, blue Review estimate button and private-link footer. Opening that button's destination in a separate tab displayed EST-01007, the correct QA customer, line item, zero total and notes. The app emitted its normal estimate-viewed notification. The public page was closed without accepting or declining; the estimate remains available as a viewed QA record.

## Booking lifecycle

Temporarily activated the existing paused QA booking journey 2026-09-11 calendar. Created manual booking 33 for Itemize QA Email Lifecycle 2026-09-13, with a QA title and notes. Initial time: September 16, 2026, 11:00?11:30 AM America/Phoenix. Rescheduled to 11:30 AM?12:00 PM, then cancelled through the booking card. The UI reflected the revised time and final Cancelled status.

| Event | Workflow outbox ID | Provider ID | Provider creation time (UTC) | Attempts | Outcome |
| --- | --- | --- | --- | --- | --- |
| Confirmed | 13 | 7541f228-afad-4bb2-9dd6-6f0f4df37e2f | 22:41:14.851 | 1 | Delivered |
| Rescheduled | 14 | dbe7b0a9-984a-4a96-a27a-9010428ffdb6 | 22:42:14.855 | 1 | Delivered |
| Cancelled | 15 | e9876ad2-bce6-4f31-b257-6f8330019c93 | 22:43:14.874 | 1 | Delivered |

All three persisted receipts reported delivered and matched read-only Resend retrieval (HTTP 200, last_event delivered). Each encrypted receipt decrypted to exactly the provider HTML. Each message contained the shared-shell tokens and correct date, start/end times and explicit America/Phoenix timezone. The cancellation included the released-appointment message. Desktop Gmail visual inspection confirmed the logo, blue top accent, white card, slate background and muted footer for all three. Gmail search highlighting is not template styling.

Returned the QA calendar to Paused and verified zero upcoming bookings. Retained the cancelled QA booking as audit evidence. At 22:44:11 UTC the deployed operations snapshot reported every registered queue available with zero queued, processing, retrying or action-required jobs. Production database access for verification used read-only transactions; no worker failure was injected.

## Remaining launch-readiness findings

1. **Provider outcome visibility is inconsistent.** The estimate editor shows the customer lifecycle status (Sent, then viewed evidence), and the expanded booking card shows scheduling status and attendee details. Neither exposes the delivered/bounced provider outcome verified in the durable receipts. Reuse the review-request convention: show email delivery evidence separately from customer or scheduling status, with tenant-scoped queries and correct latest-send/event semantics. A booking confirmation status must not be presented as proof of email delivery.
2. **Booking contact instructions have no actionable destination.** Confirmation and reschedule messages say to contact the organizer, but provide no organizer email, phone, management link or Reply-To. The retrieved messages and immutable wire payloads lack Reply-To; the sender is noreply@itemize.cloud. Provide an explicitly configured customer-facing organizer contact using established organization settings and snapshot it at enqueue time. Do not infer a public contact from a private member email.

This pass verifies production delivery, receipt persistence, desktop Gmail rendering, the public estimate destination and normal manual booking lifecycle. It does not verify estimate-response emails, mobile/other email clients, public booking creation or failure/retry behavior. No application code changed in this pass.
