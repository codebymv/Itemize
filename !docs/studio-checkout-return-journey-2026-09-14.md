# Studio hosted checkout and return journey — September 14, 2026

## Result

**Passed, isolated Stripe test mode and local Itemize application.** Baseline `1b1cceb0` supplied the actual frontend, full Nest AppModule, billing provider, signed webhook route, and authenticated GraphQL API. No application behavior changes were needed.

| Step | Observed result |
| --- | --- |
| Sign in to disposable QA account | Actual login succeeded; Account settings showed Free. |
| Click Upgrade to Studio | Actual `CreateBillingCheckoutSession` mutation succeeded and navigated to hosted Stripe Checkout. |
| Inspect checkout | Sandbox badge, explicitly labeled QA Studio product, $49/month, authorized QA email. |
| Complete test payment | Stripe session `cs_test_a1ypsZzI1uYizEMWcXsc2kYM0fZIrk7xjg6l8cAmYTaGfxxLRjw3tTFSbu` completed with `payment_status=paid`, `amount_total=4900`, `currency=usd`. |
| Process subscription event | Real event `evt_1UFVHtEHPD0TpM72O9klcBCo` was locally signed and delivered to `/api/billing/webhook`; response processed Free → Studio (`unlimited`). Canonical state came from the real Stripe provider. |
| Automatic browser return | Stripe redirected to `/settings?section=plans&checkout=success`; Itemize displayed **Welcome to Studio** and normalized the URL to `/settings?section=plans`. No manual return navigation or browser-warning bypass was used. |
| Close welcome and reload | Account settings still showed **Studio**, **$49/month**, **Renews on Oct 14, 2026**, email allowance **0 / 10,000**, and Studio marked Current Plan. Paid navigation, including Automations, was visible. |
| Persisted limits | Active `unlimited`; 10 users, 25,000 contacts, 10,000 emails, 25 workflows. |

## Method and limits

The runner initialized all migrations in a fresh PostgreSQL container on port 55448 (168 expected tables and 164 migration markers). The backend listened on loopback 3108 and the actual Vite frontend on localhost 5178, proxying API and GraphQL to that backend. Stripe account identity was checked against `acct_1U78bFEHPD0TpM72`, and only an explicit existing test key was accepted. Delivery workers and unrelated provider credentials were disabled. The QA account was seeded locally; signup and email verification were outside this journey.

Checkout used Stripe's [documented test Visa](https://docs.stripe.com/testing), a synthetic cardholder name, and the authorized recipient `codebymv@gmail.com`. Save-for-faster-checkout was disabled. No real payment was made.

An isolated helper fetched the actual Stripe event and replayed its unmodified body with an ephemeral local signing secret. This verifies real hosted checkout, the return UI, canonical provider lookup, signed application processing, and persisted entitlements together. It does **not** certify Stripe-origin public delivery to Railway, production return-origin configuration, exact proration accounting, failed/3DS checkout, or the paid status of a future renewal invoice. This was a development-server frontend journey, not an assertion about every production bundle/browser combination.

## Cleanup and retained evidence

Test subscription `sub_1UFVHsEHPD0TpM72UKjbYewM` was canceled, customer `cus_VG1JHDBcKjtA3v` deleted, and product `prod_VG1JO1YgIcvMcr` / price `price_1UFVGUEHPD0TpM72BKWJUuDc` archived. No live Stripe resources, shared portal/webhook configuration, or production application database were changed. Test event/payment history remains in Stripe.

The local application and Vite server stopped; the disposable database container was removed. The helper reported `Called end on pool more than once` because Nest had already closed the shared test pool before helper teardown. A separate check confirmed no container for project `itemize-studio-checkout-qa` and no listeners on 3108, 5178, or 55448. The loopback setup server was then stopped and QA tabs closed.

Sanitized provider/event/limit evidence is retained in ignored `tmp/studio-checkout-report.json`; the ad hoc runner is `tmp/studio-checkout-qa.cjs`. Credentials were not written to these files. This evidence does not require an application deployment.
