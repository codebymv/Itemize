# Scheduling GraphQL cutover contract

**Status:** Phase 0 characterization

**Evidence date:** 2026-07-15

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

The scheduling slice is not ready for traffic until:

1. server-authoritative slot generation and write validation enforce windows, overrides, buffers, notice, horizon, activity, timezone, and DST rules;
2. public calendar identity is globally unambiguous and cancellation tokens are hashed, expiring, and redacted;
3. calendar/booking assignee and contact references are tenant-validated and update null semantics are frozen;
4. provider tokens are encrypted with rotation and concurrent refresh protection;
5. sync becomes durable idempotent work, and `pull`/`both` behavior matches advertised settings;
6. booking workflow events use the durable outbox and the invalid legacy trigger calls are removed;
7. GraphQL operations, retained HTTP protocols, and critical calendar/public-booking/provider browser journeys pass semantic parity and rollback tests.
