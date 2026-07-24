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

## Retirement proof

The legacy Express router declares only the two public routes. All nine former
authenticated paths return `404`. The NestJS PostgreSQL suite owns the
authenticated definition, field, and submission-management contract; the
retained Express PostgreSQL suite owns the anonymous retrieval/submission
contract. Frontend transport tests prove authenticated methods call GraphQL and
the two public methods alone call HTTP.
