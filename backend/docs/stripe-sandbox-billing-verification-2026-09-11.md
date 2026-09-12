# Stripe sandbox billing verification ? 2026-09-11

Baseline: `854d340bd87063c9542580f1a45c9eb16456eef1`. Work performed in the isolated `audit/billing-lifecycle-20260911` worktree. No production application code or live Stripe subscriptions were changed.

## Result

All 11 checks passed using actual Stripe sandbox objects and a fresh disposable PostgreSQL database initialized with Itemize's migration stream. Hosted Checkout was completed in Chrome using Stripe's documented test Visa. The production `StripeBillingProvider` created Checkout and changed subscription prices.

Captured, unmodified Stripe events were signed with an ephemeral local webhook secret and posted over loopback HTTP through the production Nest controller, Stripe SDK verifier, subscription processor, notification repository, and realtime outbox. This is **signed local replay**, not evidence of Stripe-origin delivery to Railway. The focused Nest application did not load the full AppModule or run delivery workers.

| Check | Result |
| --- | --- |
| hosted checkout creates paid Solo subscription | Passed |
| checkout creation idempotency | Passed |
| new monthly subscription | Passed |
| monthly to annual | Passed |
| annual to monthly | Passed |
| failed renewal | Passed |
| payment recovery | Passed |
| cancel retains paid access until period end | Passed |
| period-end cancellation | Passed |
| duplicate event | Passed |
| reverse delivery keeps final cancellation | Passed |

Solo activation persisted `starter`, active status, 1,000 monthly emails and three seats. Failed renewal persisted `past_due`; paying the invoice restored active status. Scheduling cancellation preserved active status through the paid period. Advancing Stripe's test clock past period end applied Free limits (zero emails, one seat). Duplicate delivery was identified by the durable event claim. Replaying captured events in reverse order retained the final cancellation.

## Limits and remaining work

- The hosted Checkout showed Sandbox and $29/month, and Stripe confirmed the session completed with an active subscription. Chrome blocked the disposable loopback success page after payment; the production return-to-app journey was not exercised.
- Monthly/annual checks verify price switching and the persisted billing period. Exact prorated monetary amounts and the customer portal's scheduled downgrade behavior still need dedicated assertions. Studio Checkout was not exercised in this run.
- Stripe-origin public webhook transport, Railway configuration, and the full frontend billing journey are not certified by these local checks.
- **Webhook ordering finding (subsequently fixed locally; see `billing-webhook-canonical-state-2026-09-11.md`):** `compareStripeProviderOrder` uses `event.created`, then lexical event ID ordering for ties. The actual run included a subscription update and invoice failure with the same timestamp. Their equivalent past-due outcomes passed, but conflicting same-second changes are not proven safe. Resolve these events against current provider subscription state under serialized processing, with regressions for both arrival orders and reconciliation retries. Do not assume the passing reverse-order test covers this edge case.

Stripe documents that event delivery is unordered and snapshot timestamps have second precision: https://docs.stripe.com/webhooks#event-ordering. Test clocks and payment-method fixtures: https://docs.stripe.com/billing/testing and https://docs.stripe.com/testing.

## Isolation and cleanup

The runner accepted only an explicit test key and checked the Itemize account ID. No live charges, production database writes, shared webhook configuration changes, SMS, or Itemize outbound-email worker sends were performed. The hosted test customer used the authorized QA recipient. Test clock/customer resources were deleted, the separate Checkout subscription was canceled and customer deleted, test prices/products were archived, and the disposable database container was removed. Credentials were held in memory and never saved in the report.

Raw run evidence is retained locally under `tmp/stripe-sandbox-report.json`; an earlier processor-only run is in `tmp/stripe-sandbox-processor-report.json`. The ad hoc runner is retained under `tmp/stripe-sandbox-journeys.cjs`, outside the release surface. No deployment is required for this verification report.

Documentation validation at the original sandbox run found baseline mirror line-ending differences. The subsequent canonical-state change normalized these local mirror bytes (without prose changes), and the repository-wide docs check now passes.
