# Estimate and booking delivery visibility and organizer contact

Implemented locally after the production journey in estimate-booking-live-journeys-2026-09-13.md. These changes are not deployed and this implementation pass sent no live email.

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
