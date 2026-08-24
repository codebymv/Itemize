# Onboarding GraphQL cutover contract

**Status:** GraphQL-only; legacy REST retired

**Evidence date:** 2026-07-22

## Scope and transport decision

Authenticated onboarding progress moves to `OnboardingModule` in the NestJS
GraphQL service. It is user-scoped, not organization-scoped: switching the
selected workspace must not create a second onboarding record or expose another
user's progress.

The legacy Express routes and frontend rollout flags were removed after the
production cutover. The frontend now calls this GraphQL module directly.

| Legacy operation | GraphQL operation |
| --- | --- |
| `GET /api/onboarding/progress` | `onboardingProgress` |
| `GET /api/onboarding/progress/:featureKey` | `onboardingFeatureProgress(featureKey)` |
| `POST /api/onboarding/mark-seen` | `markOnboardingSeen(input)` |
| `POST /api/onboarding/dismiss` | `dismissOnboarding(featureKey)` |
| `POST /api/onboarding/complete-step` | `completeOnboardingStep(featureKey, step)` |
| `DELETE /api/onboarding/reset` | `resetOnboarding(featureKey)` |

## Authentication and authorization

- Every operation requires the verified `itemize_auth` cookie.
- Mutations require the shared double-submit CSRF cookie/header contract.
- Resolvers derive the user ID from verified request context. They never accept
  a user or organization ID from GraphQL variables.
- A deleted token subject returns operation-level `NOT_FOUND`; missing or
  invalid authentication follows the shared GraphQL error contract.

## Schema and consumer projection

GraphQL returns deterministic `OnboardingFeatureProgress` entries ordered by
feature key:

```text
featureKey, seen, timestamp, version, dismissed, stepCompleted
```

The frontend adapter maps the list back into the existing feature-keyed object
and maps `stepCompleted` to `step_completed`. Missing optional values remain
absent in the consumer object. Reading a feature with no stored entry returns
an explicit unseen projection instead of `null`.

Reads and mutations are permanently GraphQL-backed. Errors remain visible to
the consumer; no operation silently falls back to Express.

## Validation and state transitions

- Feature keys are trimmed, 1-50 characters, and match
  `[a-z][a-z0-9_-]*`.
- Versions are trimmed and contain 1-10 characters.
- Completed steps are non-negative GraphQL integers.
- Marking a feature seen replaces its feature projection with `seen = true`,
  the current timestamp, the requested version, and `dismissed = false`.
- Dismissal preserves existing feature fields and sets `dismissed = true`; a
  missing feature starts from `seen = true`.
- Step completion preserves existing fields and replaces `step_completed`.
- A feature reset removes only that feature. A reset without a feature clears
  the current progress document but intentionally retains historical events.

## Transaction and concurrency contract

Each mutation locks the current user row, derives the next JSON document from
that locked value, updates `users.onboarding_progress`, and writes its analytics
event in one PostgreSQL transaction. Concurrent writes to different feature
keys therefore cannot overwrite one another.

Seen, dismissal, and step-completion events are durable with the state change.
Unlike the legacy best-effort background insert, an event-write failure rolls
back the progress mutation. Reset does not create or delete analytics events.

## Required cutover evidence

- NestJS service validation and legacy-JSON normalization tests.
- Fresh PostgreSQL proof for empty/default reads, lifecycle mutations, durable
  events, concurrent feature writes, user isolation, validation, and CSRF.
- Frontend tests proving direct GraphQL delegation, retained consumer casing,
  and CSRF acquisition for mutations.
- Fresh PostgreSQL coverage for the authoritative GraphQL contract without a
  deleted REST-router dependency.
