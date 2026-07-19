# Scheduling GraphQL cutover contract

**Status:** Authenticated calendar and booking reads, authenticated booking cancellation, calendar definition mutations including deletion, and weekly availability browser-gated; date-override adapters implementation/integration-proven

**Evidence date:** 2026-07-19

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

The durable workflow queue accepts the canonical `booking_created`, `booking_cancelled`, and `booking_rescheduled` trigger vocabulary. Retained booking routes already enqueue deterministic domain keys; the cancellation GraphQL checkpoint adds payload version `1` while preserving the shared `domain:booking_cancelled:<id>` key. Create/reschedule payload versions and the long-term worker-consumer contract still need to be frozen together.

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

The second checkpoint adds only `createCalendar` and `updateCalendar`. Both are CSRF-protected and organization-scoped. Create applies normalized legacy-compatible defaults, validates IANA timezone and bounded settings, validates and deterministically orders optional recurring windows, creates Mon-Fri defaults when windows are omitted, verifies assignee membership, and enforces the organization calendar limit under an advisory transaction lock. Update distinguishes omission from explicit nullable clearing, locks the organization-owned row, validates the final assignment mode/assignee tuple, preserves omitted fields, and reloads the complete retained projection. `VITE_CALENDAR_MUTATIONS_GRAPHQL` is independent and default-off.

The third checkpoint adds `replaceCalendarAvailability`, `upsertCalendarDateOverride`, and `deleteCalendarDateOverride`. Replacement validates and deterministically orders at most 100 local weekday windows before entering a transaction, rejects overlaps and non-increasing intervals without deleting existing rows, locks the organization-owned calendar, and replaces its schedule atomically. Override upsert validates real ISO calendar dates and requires exactly one valid local-time window for available dates and no window for unavailable dates. Override deletion scopes both the child ID and its parent calendar through the verified organization, closing the legacy child-ID-only tenant boundary. All three mutations require CSRF. `VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL` is independent and default-off; authenticated bookings, anonymous booking protocols, OAuth, provider connections, and sync remain on retained transports.

The fourth checkpoint extends `VITE_CALENDAR_MUTATIONS_GRAPHQL` to `deleteCalendar`. The resolver requires CSRF and verified organization context. Delete and retained booking writes now acquire the transaction-scoped calendar-booking advisory lock before any calendar row lock or booking insert, and booking writers recheck the calendar after acquiring that namespace lock. The repository then locks the organization-owned calendar, rejects future `pending` or `confirmed` bookings, and deletes the calendar plus cascade-owned schedule/history only when that protected namespace is clear. Foreign IDs remain concealed as `NOT_FOUND`, while the active-booking conflict has stable reason `UPCOMING_BOOKINGS`.

The fifth checkpoint adds authenticated `bookings` and `booking` queries. Both require verified organization context, qualify booking and calendar rows by organization, expose contacts and assignees only through organization-consistent joins, validate status, calendar, contact, assignee, DateTime range, and bounded page inputs, and order lists by `start_time DESC, id DESC`. Foreign IDs remain concealed as `NOT_FOUND`, and raw cancellation capabilities remain excluded from GraphQL projections. `VITE_BOOKING_READS_GRAPHQL` is independent and default-off; booking writes, anonymous booking protocols, OAuth, provider connections, and sync remain on retained transports.

The sixth checkpoint adds CSRF-protected, organization-scoped `cancelBooking`. It locks the tenant-owned booking, permits only `pending` or `confirmed`, commits status, timestamp, normalized optional reason, and exactly one durable `booking_cancelled` trigger in one transaction, and rejects replay without another mutation or event. Missing and foreign IDs remain concealed. `VITE_BOOKING_MUTATIONS_GRAPHQL` independently routes only authenticated cancellation; create, reschedule, every anonymous booking protocol, OAuth, provider connections, and sync remain on retained transports.

The frontend `/calendars/:id` consumer routes definition and availability writes independently, preserving existing response shapes and REST defaults. Twelve focused calendar service cases, fourteen adapter/config cases, and eleven fresh-PostgreSQL calendar cases prove normalization, null/omission behavior, custom availability, atomic overlap rejection, available/unavailable override rules, plan limits, canonical booking/delete lock ordering, the retained-create-versus-GraphQL-delete race, delete protection/cascade behavior, CSRF, assignee and tenant denial, independent flag selection, REST interoperability, and retained-shape mapping. Eight focused booking service cases, seven fresh-PostgreSQL booking cases, and eight booking adapter/selection cases now also prove cancellation normalization, CSRF denial, terminal-state replay rejection, atomic state/event persistence, retained-shape mutation mapping, and independent REST-default routing. The complete gates pass at 144/144 NestJS focused cases, 89/89 NestJS fresh-PostgreSQL cases, 184/184 frontend cases, and 475/475 legacy fresh-PostgreSQL cases. The active calendar and booking read consumers, booking cancellation action, weekly-availability writer, and calendar deletion action have passed their staging browser and independent flag-off rollback rehearsals. Date-override adapters remain implementation/integration-proven because the shipped settings page has no writer controls.

Committed cancellation deployment `04a5cc20-a0cd-4570-a597-ec6d10eef149` passed its authenticated real-browser and independent REST rollback gate on 2026-07-19. With booking reads and cancellation enabled only in a local harness, booking `5` cancelled through successful proxy/NestJS `CancelBooking` request `0a089762-ce6d-4f1c-bcdc-77513a4238d1`; the visible row changed to `cancelled`, and PostgreSQL held the normalized reason plus exactly one version-1 event. Disabling only `VITE_BOOKING_MUTATIONS_GRAPHQL` preserved the same session and cancelled booking `6` through retained `PATCH /api/bookings/6/cancel` (`200`, request `79f95b11-cc24-4864-8cdc-fa3e3a70f9a6`) with one retained event and no later cancellation mutation. A variable-only Railway rebuild selected stale Git source and temporarily returned proxy `404`; explicitly restoring current local source recovered the gate, so staging variable changes must be followed by an explicit current-source deployment until Railway's Git source is advanced. Cleanup verified zero fixture rows, removed localhost CORS, stopped the harness, and left healthy clean backend deployment `3e439dd9-8e64-4cf8-96d8-712c2682fc12`. All booking flags remain default-off in deployed builds and production was untouched.

The completed browser gate ran on 2026-07-18 against GraphQL deployment `9705daa8-115f-4a44-acff-87919b3ee38a` through backend gate deployment `b7e0d641-4c1e-41f4-be13-f19c87ef84f5`. A disposable verified account first rendered the empty list, then created a distinctive calendar through retained REST. A real navigation reload rendered that persisted row through nonempty `CalendarReads`, and the Settings action opened `/calendars/3` through `CalendarRead`, including five recurring weekday windows. Proxy and NestJS events paired by request ID with HTTP `200` and zero errors, including list request `4811017d-e568-47e7-904f-20926f14eb41` and detail request `62871253-558f-4684-a4c7-988860483aa4`.

The detail consumer then changed the calendar name through `PUT /api/calendars/3` and Monday availability through `PUT /api/calendars/3/availability`. The browser gate exposed that native time edits were not reaching React state under real Chromium when wired only through the prior change-event path; the controls now use the native input event, and a fresh detail reload retained the new `10:00` start. Restarting only the frontend with `VITE_CALENDAR_READS_GRAPHQL=false` retained the same session and rendered the persisted name through `GET /api/calendars` and the name plus updated availability through `GET /api/calendars/3`, all without data repair. Re-enabling the flag rendered that same final state through paired zero-error `CalendarReads` request `689d320c-6ed0-4502-bf2b-6431b7ffda60` and `CalendarRead` request `a370e96a-d4c5-4762-a9cb-884ffa347235`. Cleanup deleted one disposable organization and user, stopped the local harness, removed temporary localhost CORS, and restored clean backend deployment `92940159-98ff-41a8-a2c9-306109530890`; `EXTRA_CORS_ORIGINS` is absent, the calendar flag remains default-off, and production was untouched.

The definition-mutation browser gate then passed against GraphQL deployment `4b6c8105-7364-40a8-98bd-98f0b251d490` through backend gate deployment `aa8a4f61-a8d4-4874-b6cb-d38dadf69370`. A disposable real-browser account created and updated one calendar through GraphQL while reads remained independently enabled, then disabled only `VITE_CALENDAR_MUTATIONS_GRAPHQL` and updated that same row through retained REST without data repair. Cleanup removed all fixture rows, temporary local access was removed, and clean backend deployment `c8f9ee32-a5aa-4094-acb6-a1913fb31663` restored committed source. Both prior calendar flags remain default-off and production was untouched.

The weekly-availability mutation gate passed against GraphQL deployment `2f0078e1-bccc-421b-acb0-f27055dce474` through backend gate deployment `dac4d988-7261-4501-9dd9-117724c4fdd7`. A disposable account registered and signed in through the real credential forms, created calendar `5` through `CreateCalendar`, and saved distinctive Monday hours of `10:15`–`15:45` through `ReplaceCalendarAvailability`. The UI reported success, a full reload retained the values through `CalendarRead`, and the proxy recorded zero-error mutation request `448a3cbd-c6cb-477e-a929-644757bf98d1` as HTTP `200`. Restarting only the frontend with `VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL=false` kept calendar reads and definition mutations on GraphQL; the same settings control saved `11:30`–`14:00` through `PUT /api/calendars/5/availability` (`200`, request `90acc609-6875-4cd2-a8c8-d58bc0872d09`), and another GraphQL-backed reload retained the REST-written state without repair or a later GraphQL availability mutation. Transactional cleanup returned zero disposable users, organizations, memberships, or calendars. The harness stopped, temporary localhost CORS was removed, and clean backend deployment `a7addfc5-3a75-40b8-b434-848959ed01fb` restored committed source; direct and proxied GraphQL probes both returned `Query`, all three calendar flags remain default-off, and production was untouched.

The calendar-deletion gate passed against GraphQL deployment `c6ef5954-5971-4eca-8bdb-c4858f0e8393` through backend gate deployment `e7e3143f-a7d5-44b6-82dc-77ae77652660`. A disposable account signed in through the real credential form and created three calendars through GraphQL. Deleting calendar `6` removed the row with a success notification and zero-error `DeleteCalendar` request `e44afb26-6c7f-49c6-809e-db9df8e2a8d1`. Calendar `7` had a future confirmed booking; `DeleteCalendar` request `c6ae0343-d442-4e60-b112-cc04a993e732` returned `BAD_USER_INPUT` with stable service reason `UPCOMING_BOOKINGS`, and the row plus its `1 upcoming` indicator remained. The current page collapses that domain message to `Failed to delete calendar`; exposing the actionable server copy is a non-blocking UI follow-up. Restarting only the frontend with `VITE_CALENDAR_MUTATIONS_GRAPHQL=false` then deleted calendar `8` through `DELETE /api/calendars/8` (`200`, request `W1_sDqneQMWYN0PpnpoFkQ`) without data repair. Transactional cleanup verified zero disposable users, organizations, memberships, calendars, or bookings. The harness stopped, temporary localhost CORS was removed, and clean backend deployment `8b238070-1085-4977-8b09-12761f8c3e4d` restored committed source; direct and proxied GraphQL probes both returned `Query`, all calendar flags remain default-off, and production was untouched.

The authenticated booking-read gate passed against committed GraphQL deployment `c50d8e48-93b7-4a23-ab82-f1386af29274` through backend gate deployment `8dc50b3a-37e4-4633-8520-a2e9cfd21d06`. A disposable verified account with one calendar and two bookings signed in through the real credential form. The `/bookings` page rendered both retained-shape rows through zero-error `BookingReads` request `c60069bf-d703-4350-bb44-43ca5fd8896a`; selecting Confirmed rendered only the confirmed row through request `02aa97e6-597b-4906-9a9f-b4f4ed4385b2`, and selecting Pending rendered only the pending row through request `3af754ce-a9e5-48ba-aad8-aa18c37bcf82`. Because the shipped app has no booking-detail route, authenticated staging request `c8c131fb-22b9-49ce-90db-46c6f82c4159` directly compared `BookingRead` with retained `GET /api/bookings/3` and matched identity, title, status, calendar, contact, assignee, and custom-field projections. Restarting only the frontend with `VITE_BOOKING_READS_GRAPHQL=false` kept the same session and rendered both rows through retained `GET /api/bookings` (`200`, Railway request `oQofq4qAR0e5AeD6WUN5dQ`) without data repair. Transactional cleanup verified zero disposable users, organizations, memberships, calendars, contacts, or bookings. The harness and browser tab stopped, localhost CORS was removed, and clean backend deployment `7d4dce53-f735-4151-b153-42bf5764a590` restored committed source; both health routes returned `200`, direct and proxied booking probes reached `UNAUTHENTICATED` rather than schema validation, `VITE_BOOKING_READS_GRAPHQL` remains default-off, and production was untouched.

The scheduling slice is not ready for traffic until:

1. server-authoritative slot generation and write validation enforce windows, overrides, buffers, notice, horizon, activity, timezone, and DST rules;
2. public calendar identity is globally unambiguous and cancellation tokens are hashed, expiring, and redacted;
3. booking create/reschedule references and lifecycle transitions, plus the remaining calendar-delete null/reference semantics, are tenant-validated and frozen; authenticated cancellation, booking read projections, and calendar definition/availability/override semantics are now covered;
4. provider tokens are encrypted with rotation and concurrent refresh protection;
5. sync becomes durable idempotent work, and `pull`/`both` behavior matches advertised settings;
6. create/reschedule booking event payload versions and worker-consumer idempotency are frozen; cancellation already writes one versioned event to the durable queue;
7. cancellation plus the remaining GraphQL operations, retained HTTP protocols, and critical calendar/public-booking/provider journeys pass semantic parity and rollback tests.
