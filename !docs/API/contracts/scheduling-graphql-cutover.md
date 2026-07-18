# Scheduling GraphQL cutover contract

**Status:** Phase 1 authenticated calendar reads browser-gated; calendar definition create/update checkpoint implemented and awaiting staging gate

**Evidence date:** 2026-07-18

## Decision

Authenticated calendar, booking, connection, and sync-management operations move to GraphQL. Anonymous booking-page/slot/create/cancel routes and the Google OAuth callback remain rate-limited HTTP protocols owned by NestJS. Starting a provider connection becomes a GraphQL mutation that returns the provider authorization URL.

The authoritative assignments for all 25 scheduling operations are in `graphql-operation-overrides.json`.

## Ownership

| Domain | NestJS owner | Target operations |
| --- | --- | --- |
| Calendars and availability | `CalendarsModule` | `calendars`, `calendar`, `createCalendar`, `updateCalendar`, `deleteCalendar`, `replaceCalendarAvailability`, `upsertCalendarDateOverride`, `deleteCalendarDateOverride` |
| Authenticated bookings | `BookingsModule` | `bookings`, `booking`, `createBooking`, `cancelBooking`, `rescheduleBooking` |
| Anonymous booking protocol | `PublicBookingsModule` | retained HTTP `getPublicBookingPage`, `getPublicBookingSlots`, `createPublicBooking`, `cancelPublicBooking` |
| Connection and sync management | `CalendarIntegrationsModule` | `calendarConnections`, `disconnectCalendar`, `updateCalendarConnection`, `beginGoogleCalendarConnection`, `providerCalendars`, `requestCalendarSync`, `calendarSyncStatus` |
| Provider redirect | `CalendarOAuthModule` | retained HTTP `googleCalendarCallback` |

## Authentication and tenancy

Every GraphQL operation uses verified user and organization context. Calendar, booking, contact, assignee, connection, and sync-event projections must belong to that context; an outside-organization ID returns `NOT_FOUND`.

- Anonymous routes derive the organization from a globally unambiguous public calendar identity, never from a request header.
- A calendar assignee must be a current member of its organization.
- A booking's calendar, contact, and assignee form one organization-consistent tuple.
- Connections are user-owned inside an organization. An organization peer cannot read or operate another user's provider tokens.
- The OAuth callback accepts identity and tenant claims only from signed, short-lived state and rechecks current organization membership before exchanging the code.

Legacy OAuth state formerly contained unsigned JSON with trusted `userId`, `organizationId`, and `returnUrl`, allowing forged connection ownership and an open redirect. State is now HMAC-signed, expires after ten minutes, contains a nonce, and restricts redirects to local frontend paths. The target should use a dedicated rotated secret and may store/claim the nonce when a provider does not guarantee one-time authorization codes.

## Calendar definition and availability

Calendar timezone is a valid IANA zone. Durations, buffers, notice, future horizon, and reminders are bounded non-negative integers; duration is greater than zero. Update inputs distinguish omitted fields from explicit null.

Recurring windows use calendar-local weekday/time values. Each window has `start < end`, windows do not overlap on the same weekday, and overnight availability requires an explicit product rule rather than accidental SQL behavior. An available date override requires a valid start/end window; an unavailable override has no window. Replacement commits atomically.

Delete locks the organization-owned calendar and the same booking namespace used by booking creation. Pending or confirmed future bookings block deletion. The legacy route now has this transaction boundary.

## Booking identity and lifecycle

Booking timestamps are absolute instants plus a valid display timezone. `endTime` must be later than `startTime`. The target lifecycle is:

```text
pending -> confirmed -> completed
pending|confirmed -> cancelled
pending|confirmed -> no_show
```

Rescheduling applies only to active bookings. Cancellation and rescheduling are explicit mutations with conflict behavior for invalid states. Repeated cancellation must not emit duplicate domain events.

For every create or reschedule, the service takes a transaction-scoped lock for the calendar, evaluates collision and availability policy, writes the booking, and writes a durable domain event in the same transaction. Legacy manual and public creation plus rescheduling now share the collision lock. A real-PostgreSQL race proves two simultaneous reservations for the same calendar interval commit exactly one row.

Collision uses half-open intervals: `[start, end)`. Adjacent bookings are permitted. The complete policy must also apply buffers, recurring windows, date overrides, minimum notice, maximum future horizon, calendar activity, and external busy intervals. Legacy writes currently enforce only existing-booking overlap; this is a cutover blocker.

## Public booking HTTP contract

The four anonymous routes remain HTTP because they are public embed/capability protocols. They require abuse limits, request/body bounds, non-enumerating errors where appropriate, and operational correlation without logging attendee PII or cancellation tokens.

The current database guarantees only `(organization_id, slug)` uniqueness while public routes query slug alone. The target identity must be globally unique or include an organization slug. Ambiguous public lookup is forbidden.

Slot calculation is server-authoritative and timezone-aware. The legacy endpoint returns availability, overrides, and bookings for browser-side calculation; this can drift from write validation and exposes more schedule data than necessary. The target returns only concrete bookable instants and a short-lived availability version/claim. Creation rechecks every rule transactionally and never trusts a slot merely because a browser displayed it.

Public booking contact reuse is case-insensitive and serialized by organization/email. Email is not declared a universal CRM identity; this reuse policy is specific to public booking. Contact creation, booking creation, and the durable booking event share a deliberate transaction/error policy.

Cancellation tokens are high-entropy capabilities bound to the public calendar and active booking state. Store a hash rather than the raw token, compare safely, redact it from logs and GraphQL, define expiry/rotation, and reject replay. Legacy coverage proves wrong-slug and repeated cancellation fail.

## Provider connections and sync

Provider access and refresh tokens are secrets. They must be envelope-encrypted at rest with key versioning, excluded from DTOs/logs/errors, and refresh must serialize per connection so concurrent requests do not lose the newest refresh token. The legacy schema stores plaintext tokens; migration and rotation are P0 blockers.

Connection settings validate provider, sync direction, and selected calendar identifiers. Disconnect defines whether remote events are retained or removed. Provider calls do not run inside a GraphQL resolver transaction.

`requestCalendarSync` creates an idempotent durable job. A worker claims it, refreshes credentials safely, applies the selected direction/calendars, and upserts per-booking sync state with provider event idempotency. Partial failures are retryable and visible; one bad event does not make the whole batch appear successful. Pull synchronization is not implemented by the legacy service even though `sync_direction` permits `pull` and `both`; the target must either implement it or stop advertising it.

## Workflow and event boundary

Booking mutations must write versioned `booking.created`, `booking.cancelled`, and `booking.rescheduled` events to the durable outbox described by the workflow execution contract. Resolvers do not invoke the automation engine or email/calendar providers.

The legacy booking routes call dormant engine triggers named `booking_created`, `booking_cancelled`, and `booking_rescheduled`. Those values are not accepted by the workflow trigger schema. Enabling that engine is not a migration path; event names, payload versions, idempotency, and worker consumers must be implemented together.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Calendars | CRUD, assignment denial, timezone/numeric validation, omitted/null inputs, delete/create race, active-booking protection, tenant denial |
| Availability | window validation/overlap, atomic replacement rollback, override rules, DST gaps/folds, tenant denial |
| Booking lists | filters, strict timestamp/page inputs, deterministic ordering, bounded relation projections, tenant denial |
| Booking writes | invalid interval, adjacent/overlap/buffer cases, simultaneous create, create-versus-reschedule, lifecycle conflicts, reference denial, transaction rollback |
| Public booking | global identity, rate/body limits, authoritative slots, min notice/horizon, DST, same-email race, collision race, token wrong-calendar/expiry/replay/redaction |
| OAuth | signed/expired/tampered state, membership removed during flow, safe return path, provider denial/error, code replay, token encryption/redaction |
| Sync | connection ownership, concurrent refresh, job idempotency, push/update/delete, selected calendars, partial retry, provider rate limit, pull/both policy |
| Events | outbox atomicity, payload version, one event per transition, worker retry/idempotency, no provider calls from resolver |

## Current evidence and exit gate

Fresh PostgreSQL suites cover calendar CRUD/tenancy, availability replacement, overrides, booking CRUD/tenancy, public creation, public cancellation capability binding/replay, invalid intervals, and simultaneous overlap prevention. Unit tests cover signed OAuth state, expiry, tampering, and redirect normalization.

The first bounded NestJS checkpoint implements authenticated `calendars` and `calendar` reads. Both require verified organization context, qualify every calendar lookup by organization, expose an assignee name only through a current membership, return deterministic list ordering and confirmed-booking aggregates, and project ordered recurring availability plus current/future date overrides on detail. `VITE_CALENDAR_READS_GRAPHQL` is independently default-off and preserves the existing REST response shape.

The second checkpoint adds only `createCalendar` and `updateCalendar`. Both are CSRF-protected and organization-scoped. Create applies normalized legacy-compatible defaults, validates IANA timezone and bounded settings, validates and deterministically orders optional recurring windows, creates Mon-Fri defaults when windows are omitted, verifies assignee membership, and enforces the organization calendar limit under an advisory transaction lock. Update distinguishes omission from explicit nullable clearing, locks the organization-owned row, validates the final assignment mode/assignee tuple, preserves omitted fields, and reloads the complete retained projection. `VITE_CALENDAR_MUTATIONS_GRAPHQL` is independent and default-off; delete, availability replacement, date overrides, authenticated booking operations, anonymous booking protocols, OAuth, provider connections, and sync remain on their current transports.

The frontend `/calendars/:id` consumer now routes definition create/update through GraphQL only when that mutation flag is enabled, while recurring availability continues through retained REST. Six focused calendar service cases, ten adapter/config cases, and six fresh-PostgreSQL calendar cases prove normalization, null/omission behavior, custom availability, plan limits, CSRF, assignee denial, REST-default routing, REST interoperability, tenant isolation, and retained-shape mapping. The complete gates pass at 130/130 NestJS focused cases, 77/77 NestJS fresh-PostgreSQL cases, 172/172 frontend cases, and 475/475 legacy fresh-PostgreSQL cases. The definition-mutation staging/browser and rollback rehearsal is still required before enabling its flag.

The completed browser gate ran on 2026-07-18 against GraphQL deployment `9705daa8-115f-4a44-acff-87919b3ee38a` through backend gate deployment `b7e0d641-4c1e-41f4-be13-f19c87ef84f5`. A disposable verified account first rendered the empty list, then created a distinctive calendar through retained REST. A real navigation reload rendered that persisted row through nonempty `CalendarReads`, and the Settings action opened `/calendars/3` through `CalendarRead`, including five recurring weekday windows. Proxy and NestJS events paired by request ID with HTTP `200` and zero errors, including list request `4811017d-e568-47e7-904f-20926f14eb41` and detail request `62871253-558f-4684-a4c7-988860483aa4`.

The detail consumer then changed the calendar name through `PUT /api/calendars/3` and Monday availability through `PUT /api/calendars/3/availability`. The browser gate exposed that native time edits were not reaching React state under real Chromium when wired only through the prior change-event path; the controls now use the native input event, and a fresh detail reload retained the new `10:00` start. Restarting only the frontend with `VITE_CALENDAR_READS_GRAPHQL=false` retained the same session and rendered the persisted name through `GET /api/calendars` and the name plus updated availability through `GET /api/calendars/3`, all without data repair. Re-enabling the flag rendered that same final state through paired zero-error `CalendarReads` request `689d320c-6ed0-4502-bf2b-6431b7ffda60` and `CalendarRead` request `a370e96a-d4c5-4762-a9cb-884ffa347235`. Cleanup deleted one disposable organization and user, stopped the local harness, removed temporary localhost CORS, and restored clean backend deployment `92940159-98ff-41a8-a2c9-306109530890`; `EXTRA_CORS_ORIGINS` is absent, the calendar flag remains default-off, and production was untouched.

The scheduling slice is not ready for traffic until:

1. server-authoritative slot generation and write validation enforce windows, overrides, buffers, notice, horizon, activity, timezone, and DST rules;
2. public calendar identity is globally unambiguous and cancellation tokens are hashed, expiring, and redacted;
3. booking assignee/contact references and the remaining availability/override/delete null and reference semantics are tenant-validated and frozen; calendar definition assignee and update-null semantics are now covered;
4. provider tokens are encrypted with rotation and concurrent refresh protection;
5. sync becomes durable idempotent work, and `pull`/`both` behavior matches advertised settings;
6. booking workflow events use the durable outbox and the invalid legacy trigger calls are removed;
7. GraphQL operations, retained HTTP protocols, and critical calendar/public-booking/provider browser journeys pass semantic parity and rollback tests.
