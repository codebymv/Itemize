# Rate limiting

Three limiters run in the NestJS API. All three count hits in one shared
`RateLimitBucketStore` (`backend/src/common/rate-limit-store.ts`), so the
ceilings hold whether the API runs as one replica or several.

| Limiter | Where | Key | Window | Ceiling |
| --- | --- | --- | --- | --- |
| Ingress | `express-rate-limit` on `/api` and `/graphql` (`configure-app.ts`) | proxy-resolved IP | `API_RATE_LIMIT_WINDOW_MS` (15 min) | `API_RATE_LIMIT_MAX` (1000) |
| Authentication | `AuthRateLimitService` on register, login, verification, reset | IP + normalised identity | 15 min | 20 standard / 10 strict (100 / 80 in development) |
| AI | `AiRateLimitService` per operation | per actor (signed in) plus a 3× per-IP ceiling; per IP for public marketing chat | 15 min | 120 workspace suggestions, 60 marketing tokens, 30 marketing asks |

Exceeding a ceiling returns HTTP 429 from the ingress limiter, or a GraphQL
error with `code: RATE_LIMITED` and `reason: AUTH_RATE_LIMITED` /
`AI_RATE_LIMITED` from the service limiters.

## Storage

`RATE_LIMIT_STORE` selects where buckets live:

- `postgres` (default outside `NODE_ENV=test`): the `rate_limit_buckets`
  table (migration `rate_limit_buckets_v1`). A hit is one atomic upsert that
  restarts a lapsed window at 1 or increments the live one, so concurrent
  replicas cannot both observe the same count. Expired rows are swept about
  once per thousand hits.
- `memory`: per-process maps. Correct only on a single replica; used by the
  test suites, which drive the API far past any ceiling.

The Express ingress limiter adapts the same store through
`SharedRateLimitStore` (`express-rate-limit-store.ts`); skipped requests are
not un-counted, so the ceiling is a hard per-window budget.

## Scaling note

Before adding a second API replica nothing else needs to change: every
limiter already reads and writes the shared table. Postgres round-trips add
one small query per limited request; if that ever matters, the store
interface is the seam for a Redis implementation.
