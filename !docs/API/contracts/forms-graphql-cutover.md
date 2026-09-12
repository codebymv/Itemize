# Forms GraphQL cutover

## Final transport boundary

Authenticated form administration is GraphQL-only:

- `forms`
- `form`
- `createForm`
- `updateForm`
- `deleteForm`
- `duplicateForm`
- `replaceFormFields`
- `formSubmissions`
- `deleteFormSubmission`

The frontend preserves its established snake-case service types while calling
these operations directly. There is no feature flag, REST fallback, or
dual-write path.

Anonymous embed traffic remains HTTP:

- `GET /api/forms/public/form/:identifier`
- `POST /api/forms/public/form/:identifier`

These endpoints are a public protocol rather than an authenticated application
API. They retain independent rate limiting, `no-store` delivery, globally
unique public identifiers, ambiguous legacy-slug denial, bounded typed
validation, safe redirects, transactional contact reuse/submission persistence,
and durable workflow and notification intents.

NestJS `PublicFormsModule` owns both public routes directly. The current
PostgreSQL suite is `backend/test/integration/public-forms.integration-spec.ts`.
The legacy runtime, default-off proxy, and `PUBLIC_FORMS_NESTJS_ENABLED` switch
were retired; historical parity tests are not a second production owner.

## Retirement proof

The standalone Express origin and its routers have been deleted. Current NestJS
PostgreSQL suites cover authenticated form management and the anonymous protocol.
Frontend transport tests prove authenticated methods call GraphQL and the two
public methods alone call HTTP.


## Paid public intake (2026-09-11)

Public form/calendar discovery and new intake require the shared paid-entitlement
predicate: a paid plan with active status or a non-expired trial. Intake locks the
organization for the transaction so subscription changes cannot race admission.
Ineligible resources return 404 without deleting or changing their publication state.
Existing booking capability status/cancellation remains available while the token
is valid. Queued workflow notifications retain the existing paid-access claim rule.


## Shared contact quota (2026-09-11)

Contact creation uses the shared organization transaction lock and stored quota.
Public forms/bookings preserve intake with no new contact when full, while reusing
existing email-matched contacts. Explicit chat conversion returns PLAN_LIMIT_REACHED
without changing session/transcript state, and can be retried after capacity returns.
See [contact quota audit](../../contact-quota-audit-2026-09-11.md).
