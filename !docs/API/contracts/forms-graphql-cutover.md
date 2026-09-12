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
