# Contact quota enforcement - 2026-09-11

## Behavior

All five Nest contact creation paths now share the same contact-capacity policy:
manual creation, CSV import, public form submission, public booking, and authenticated
chat-session conversion. Public form/booking paths and chat conversion previously
inserted without checking the organization's stored contact limit.

Manual entry, imports and chat conversion use the established PLAN_LIMIT_REACHED
error. Imports remain all-or-nothing after duplicate filtering. Replayed successful
manual/import requests retain their prior result even when the organization is now
at capacity. An import containing only skipped duplicates consumes no capacity.

Public forms and bookings continue accepting otherwise eligible submissions when
contact capacity is exhausted. They preserve original submission/attendee details,
notification delivery and booking management, but leave contact_id null when a new
contact cannot be created. They can still link to an existing email-matched contact.
No stored lead data is discarded and no existing contact is deleted on downgrade.
There is no automatic backfill of previously unlinked submissions after an upgrade.

Chat conversion remains available for retry after capacity is restored. A rejected
conversion creates no contact, does not mark the session converted and does not copy
its transcript. Public chat messaging behavior is unchanged.

## Transaction convention

contacts/contact-capacity.ts owns lockContactCreation and contactCapacity. Every
creator first takes the existing organization advisory transaction lock, then a shared
organization row lock. Intake takes these before its paid-access row lock and before
calendar/session/email locks. The shared row lock prevents a billing-limit update
from committing between the check and insert. Existing unrelated organization writers
keep their advisory-lock ordering; the lock namespace has not been changed.

Counts include all stored contact statuses, matching existing manual/import semantics.
The stored contacts_limit is authoritative; -1 is unlimited and zero is zero. A null
limit falls back to the billing catalog. Free, unknown or missing organizations do
not inherit Solo's default 5,000-contact allowance.

## Verification and boundaries

Focused PostgreSQL tests cover mixed manual/import/form competition for the final
slot, retained form data and existing-contact linking at capacity, retained bookings,
chat rejection and subsequent conversion, and existing idempotency behavior. Unit
coverage includes finite/unlimited/zero/fallback limits and multi-row admission.
Final test and deployment evidence is recorded in tmp/contact-quota-verification-2026-09-11.md.

No production organization limit will be reduced to test this change. Capacity races
and rejection journeys use disposable PostgreSQL fixtures. Live verification checks
the deployed implementation and health without creating customer-facing deliveries.

Email usage accounting and signature creation-versus-send semantics remain separate
open items in the billing entitlement audit. SMS and backup/restore stay out of scope.
