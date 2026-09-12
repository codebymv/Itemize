# Canonical Stripe webhook state ? 2026-09-11

## Change

Billing webhooks and reconciliation now retrieve the current subscription from Stripe after taking the organization row lock. Event IDs retain durable delivery deduplication, but timestamps and lexical event-ID ordering no longer choose subscription state. This fixes conflicting same-second events and delayed snapshots.

A delayed `invoice.payment_failed` can observe an already-recovered active subscription. An old activation can observe a canceled subscription and apply Free limits. The canonical customer and subscription IDs must match the incoming provider identity before any state is written. Cancellation timestamps come from the current Stripe subscription when available.

The same transaction retains tenant mapping checks, claim, organization/subscription writes, audit records, and internal/queued notifications. Duplicate events skip provider requests. Unmatched/ambiguous mappings still enter the existing reconciliation queue. A provider error rolls back a fresh webhook claim and returns HTTP 500 so Stripe can retry; reconciliation retains its existing retry/dead-letter flow. Neither path falls back to the old snapshot. SDK error text is replaced with a safe retry reason before reaching application logs.

## Operational implications

This adds a Stripe API read for each non-duplicate, supported, uniquely mapped event and each reconciliation attempt. It requires the existing `STRIPE_SECRET_KEY` to permit subscription reads. Requests use a 10-second timeout and at most one SDK retry. The organization lock remains held during that bounded lookup to prevent slower responses overwriting newer state. During Stripe outages, the last committed state remains until a retry succeeds; operator monitoring of webhook failures and reconciliation dead letters remains necessary.

No migrations, new environment variables, frontend changes, live charges, or production deployment are part of this change.

## Validation

- 23 fresh-PostgreSQL integration tests passed across subscription webhooks and reconciliation workers, including both same-second arrival orders, delayed snapshots, canonical cancellation dates, provider failure rollback/retry, customer mismatch, duplicate suppression and no duplicate upgrade notification.
- The concurrency regression waits until PostgreSQL reports the second request blocked on the row lock, verifies it has not read Stripe yet, then releases the first request and checks the final canceled state.
- Full backend unit suite: **989 tests passed across 200 suites**. Five new provider unit cases cover canceled lookups, request bounds, missing credentials, and safe handling of missing-resource, rate-limit and connection errors.
- Backend build and environment contract passed (142 runtime variables).
- Documentation mirrors synchronized, including normalization of three baseline mirror line-ending differences; no prose changes in those three files.

Logs: `tmp/webhook-integration-final.log`, `tmp/webhook-unit.log`, `tmp/backend-unit-final.log`, `tmp/backend-build-final.log`.

These are local regressions with controlled provider state. The earlier real sandbox lifecycle run is documented in `stripe-sandbox-billing-verification-2026-09-11.md`. Public Stripe-to-Railway delivery, exact proration totals, portal schedule transitions and the complete return-to-app journey remain separate verification work.

Stripe's event ordering guidance: https://docs.stripe.com/webhooks#event-ordering.
