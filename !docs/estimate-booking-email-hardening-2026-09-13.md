# Estimate and booking delivery visibility and organizer contact

Implemented after the production journey in estimate-booking-live-journeys-2026-09-13.md and deployed as e83925c4. Production deployment and delivery-label verification passed; organizer-contact inbox verification remains pending configuration. No new live email was sent in this verification pass.

## Behavior

Estimates now expose nullable emailDeliveryStatus through their tenant-scoped GraphQL list/detail projection. It selects the newest customer estimate_sent delivery before reading its receipt, so a queued resend cannot inherit the previous send's Delivered status. Owner-facing acceptance/decline notifications are excluded. The estimate list and editor display provider outcome separately from customer lifecycle status.

Bookings expose the latest notification's provider status and event. Both outbox and receipt queries are organization-scoped; booking ID comparison does not cast arbitrary JSON to an integer. Labels identify Confirmation email, Reschedule email or Cancellation email. A pending latest event cannot fall back to a previously delivered event. Unknown/absent provider evidence renders no invented outcome. Booking Confirmed/Cancelled remains scheduling state.

The shared EmailDeliveryStatus component now serves reviews, estimates and bookings. Recent pending outcomes refresh every 15 seconds for up to ten minutes after the record update while the page is visible; list refreshes retain existing content. Focus refreshes older records. The editor reads refreshed delivery evidence without reinitializing unsaved form fields.

Booking confirmation/reschedule emails snapshot an actionable organizer mailto link using the organization's explicitly selected active default business email, then the existing payment settings business email. These are customer-facing business settings already used by estimate rendering. No member/owner private email is inferred. The body includes the address in both HTML and plain text; the mailto address is encoded and HTML escaped. Invalid or absent contact data uses fallback wording referring to the contact details provided when arranging the appointment. Organizations still need a valid customer-facing business email configured for an actionable link. Cancellation retains the released-appointment copy.

The contact lives in the existing immutable body snapshot. Editing business settings later does not rewrite queued messages or existing encrypted provider payloads. The provider sender/Reply-To configuration is unchanged; customers use the explicit organizer contact link.

## Validation

- 30 backend unit tests passed across booking contact rendering, booking service and estimate delivery service.
- 16 fresh PostgreSQL integration tests passed, including real latest-send/event queries, owner-response exclusion, tenant isolation, pending resend masking, contact snapshot immutability and the existing booking GraphQL lifecycle suite.
- 15 frontend tests passed across outcome rendering, bounded/visible-only refresh, estimate/booking adapters and review-request rendering.
- Backend and final frontend builds, all bundle budgets (entry 407.63 KB / 430 KB), ten release contracts, frontend lint (zero errors; 55 existing warnings) and documentation/diff checks passed.

## Rollout

Deploy the backend before the frontend starts querying the new fields. No database migration or new dependency is required. After deployment, verify existing delivered estimate/booking evidence in the UI and use one authorized QA lifecycle send with a configured business email to inspect the organizer link. The earlier production inbox evidence covers the pre-change templates only. Mobile and other email-client checks remain outstanding.

## Production verification ? September 13, 2026 (Phoenix)

At 2026-09-14 03:33 UTC, CI run 34789086242 succeeded on e83925c468e1bd937d3ba3b8bd3c55419bbeadd1. Railway frontend deployment 3ebc9c0d-e369-4092-817e-f0a8942c7012 and backend deployment 13b33b84-f5ec-4d23-97b4-7b1f71e30308 both reported SUCCESS on that commit. The backend runtime independently confirmed the same SHA. API readiness, frontend HTML and entry asset returned 200; an unsigned billing webhook returned 400 for missing signature.

The production estimate list and EST-01007 editor display Email delivered alongside Sent and the previously recorded view evidence. Booking 33 displays Cancelled and Cancellation email delivered. Older rows without provider evidence show no fabricated delivery labels. These checks used existing QA deliveries; no resend or fresh booking was created.

At 03:35:07 UTC, all registered operations queues were available with zero pending or action-required work. The QA organization's selected business/payment settings contain no business contact email, so an actionable organizer mailto link cannot yet be verified with its current configuration. No contact address was inferred from private member data or changed during this pass. The link-rendering and contact snapshot behavior is covered by the recorded local tests; a newly delivered contact-bearing email and mobile inbox rendering remain unverified.

## Follow-up: business profile creation regression

The live organizer-contact setup exposed a separate frontend bug: both Add business actions passed the React click event into openBusinessDialog's optional business argument. This selected Edit Business with no valid ID and made saving fail. A read-only production check confirmed no business profile was created for the QA organization by the failed attempt.

Both creation buttons now invoke the callback with no arguments. Regression tests cover empty and populated profile lists; the existing payment-settings hook suite covers create/edit behavior. All eleven focused tests, the frontend build and bundle budgets passed. This correction is required before resuming the live organizer-contact setup.

## Organizer contact journey verified in production

At 2026-09-14 03:56 UTC (September 13 in Phoenix), commit 67c1c0611a207b460fde7260537cd956d299e879 passed CI run 34803631201 and deployed successfully to both Railway services: frontend d07ddeba-2f0d-4bd9-b9c4-ce577b9658e5 and backend 9dc8507e-9445-47bd-b3d5-8a919ed8e763. The runtime confirmed the commit. Readiness, frontend and entry asset returned 200; an unsigned billing webhook returned 400.

The repaired Add business action opened a blank creation form and successfully created Itemize QA with the authorized QA email, codebymv@gmail.com. That business was explicitly selected and saved as organization 14's default identity. The QA contact remains configured for future tests.

Booking 34, Itemize QA Organizer Contact 2026-09-13, was created through the production UI for September 17, 11:00-11:30 America/Phoenix. Confirmation outbox 16 and cancellation outbox 17 each completed on the first attempt and have delivered provider receipts. Confirmation provider ID: 1c7320a5-f025-47a3-a3b6-cef9cf1898fc; cancellation provider ID: ab7c8982-50e2-4143-ba19-782763385af6.

The Resend confirmation body matched the encrypted immutable provider payload, contained the shared logo/color/font tokens, and included the configured organizer address in HTML and plain text. Gmail desktop visibly rendered the branded card and an actual mailto:codebymv@gmail.com link. Itemize's booking list updated to Confirmation email delivered. No reply was sent.

The test booking was cancelled and the QA calendar restored to Paused with zero upcoming appointments. At 03:59:58 UTC, all registered operations queues were available with zero queued, processing, retrying or action-required work. This closes the live organizer-contact gap recorded above. Mobile and other email-client rendering remain unverified.
