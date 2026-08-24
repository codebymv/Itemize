# Billing GraphQL cutover

## Final transport boundary

Authenticated billing application traffic is GraphQL-only:

- `billingStatus`
- `billingUsage`
- `createBillingCheckoutSession`
- `createBillingPortalSession`
- `acknowledgeBillingTrialEnd`

`billingPlans` is a public GraphQL metadata query. It returns the three complete
purchasable plans (`starter`, `unlimited`, and `pro`); the legacy half-defined
`free` object is deliberately removed. Unlimited plan limits use `-1`, the
application's established sentinel, rather than the `null` produced when JSON
serialized JavaScript `Infinity`.

Stripe's subscription callback remains HTTP at
`POST /api/billing/webhook`. It depends on exact raw bytes and a Stripe
signature, so moving it into GraphQL would weaken rather than simplify its
protocol boundary. The existing PostgreSQL webhook suite continues to prove
signature refusal, transactional event claims, deterministic event ordering,
tenant reconciliation, subscription updates, and durable notification retry.

## Authorization and state

Status, usage, checkout, portal, and acknowledgement require verified selected
organization membership. Every mutation also requires CSRF. Status and usage
derive tenant identity only from request context; no billing operation accepts
an organization ID from the browser.

Checkout serializes initial customer creation on the organization row and uses
a stable tenant-specific Stripe idempotency key, preventing duplicate customers
across concurrent requests and transaction retries. Each checkout or portal
request also carries a browser-generated idempotency key that is namespaced by
organization before provider use. Provider calls have bounded timeout/retry
configuration, and provider failures return a stable redacted service error.

Only subscription checkout is supported. A request may select a published plan
and monthly/yearly period or one configured price from the same allowlist.
Arbitrary prices and the unused legacy one-time-payment mode are rejected.
Success, cancellation, and portal-return URLs must be credential-free HTTP(S)
URLs and, when application origins are configured, must match one of them.

When an organization already has an active or trialing subscription, checkout
returns a provider portal session instead of creating a second subscription.
Status may perform a best-effort provider reconciliation only when persisted
state is visibly stale; the signed webhook remains authoritative and a
provider-read failure never makes the persisted snapshot unavailable.

## Consumer and retirement proof

The existing `billingApi` facade preserves its success/failure envelopes,
snake-case status fields, and `unlimited` usage string while all six methods
call the GraphQL adapter directly. There is no rollout flag, REST fallback, or
dual write.

The Express billing router declares only the signed webhook. The six retired
application paths return `404`. Focused frontend tests cover every adapter and
compatibility envelope; service tests cover plan completeness, input and
redirect refusal, active-subscription routing, and error redaction; fresh
PostgreSQL tests cover public access, tenant denial, CSRF, status/usage mapping,
price refusal, concurrent customer creation, checkout, portal, and persisted
acknowledgement. The full clean-schema gate passes 473/473 retained Express
tests and 252/252 NestJS PostgreSQL tests.
