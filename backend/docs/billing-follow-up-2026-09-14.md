# Billing follow-up — September 14, 2026

## Executed downgrade test — result supersedes the initial concern

**Passed in Stripe test mode.** The portal scheduled a Studio-to-Solo downgrade across two separate products. The same-product restriction in Stripe's documentation did not describe the observed behavior in this run. Product separation alone is not a demonstrated launch defect; no catalog migration is justified by this finding.

The isolated probe used Itemize account acct_1U78bFEHPD0TpM72, two newly created test products, monthly prices of $49 and $29, a test-clock customer with Stripe's test Visa, and a portal configuration with `decreasing_item_amount` and `shortening_interval` conditions plus `create_prorations`.

| Step | Observed result |
| --- | --- |
| Initial Studio subscription | Active on the $49 monthly price; period ends October 14, 2026. |
| Customer selects Solo in portal | Preview explicitly says October 14 effective date and retention of current features until then. |
| Confirm test change | Subscription remains active on Studio. Schedule sub_sched_1UFUz9EHPD0TpM72tdOW91YT has Studio until timestamp 1791965410 and Solo from that timestamp. |
| Advance test clock past boundary | Subscription is active on Solo; current period ends November 14; schedule is released. |
| Reload portal | Shows Solo at $29/month with November 14 as the next billing date. |

Subscription sub_1UFUxsEHPD0TpM72cJ8wqnLz used Studio price price_1UFUxqEHPD0TpM72BHdC31TV and Solo price price_1UFUxqEHPD0TpM72KnnRIksm, on different products. Sanitized before/after evidence is retained in ignored `tmp/downgrade-report.json`.

This verifies Stripe portal scheduling and the provider's price transition, not Itemize webhook delivery, application entitlement transition, hosted Studio checkout, exact proration accounting, or the paid status of the next invoice. Those remain separate checks.

Cleanup removed the test clock and its customer, archived both test products/prices, and disabled all features and cleared products on the test portal. Stripe automatically made this first test-mode configuration the default and refused deactivation, so bpc_1UFUxuEHPD0TpM72grt6D1ln remains as a disabled-feature test default. No live billing resources or application database were changed. The helper used an existing test key in memory only.

## Application webhook and entitlement regression

On September 14, the current master code plus a new regression passed both focused billing integration suites: **22 tests, 2 suites**. The runner initialized a fresh disposable PostgreSQL database (168 expected tables, 164 migration markers), exercised the real signed Nest `/api/billing/webhook` route, and queried authenticated `billingStatus` through GraphQL. Stripe canonical-state retrieval used controlled fixtures matching the separately observed test-clock transition; this was not Stripe-origin delivery to Railway.

- Before the renewal boundary, the future Solo schedule preserved active Studio and its limits: 10 users, 25,000 contacts, 10,000 emails, 25 workflows.
- Once canonical state changed to Solo, the app exposed active Solo with 3 users, 5,000 contacts, 1,000 emails, and 5 workflows.
- Duplicate delivery and a delayed Studio snapshot preserved Solo and produced exactly one shared in-app downgrade notification. No downgrade notification appeared before the boundary.
- The initial regression incorrectly expected a `subscription_downgraded` email type. Existing code queues upgrade/activation emails and uses `subscription.plan_changed` for in-app downgrade notices; the test now verifies that convention. No application behavior change was needed.

Regression: `backend/test/integration/subscription-webhooks.integration-spec.ts`. Command: `node db/scripts/run-integration-tests-fresh.js --runTestsByPath test/integration/subscription-webhooks.integration-spec.ts test/integration/billing.integration-spec.ts`. This establishes application processing and exposed limits under controlled provider state. Public Stripe-to-Railway transport, hosted Studio checkout/return, exact proration amounts, and paid renewal invoice status remain separate evidence gaps.

## Later hosted Studio checkout and return verification

The [Studio checkout journey](studio-checkout-return-journey-2026-09-14.md) subsequently passed on baseline `1b1cceb0`: actual Itemize upgrade action, paid $49 Stripe sandbox session, signed local replay of the real subscription event, automatic return to **Welcome to Studio**, and Studio account state retained after reload. This closes the isolated hosted Studio checkout/local-return gap listed above. Public Stripe-to-Railway delivery, production return configuration and exact proration remain separate checks.

## Confirmed observations

Stripe dashboard remained signed in to Itemize account acct_1U78bFEHPD0TpM72. Test mode was available and its active product catalog had no entries. The previous isolated lifecycle runner remains in the billing-lifecycle QA worktree; it covered Solo, not Studio checkout or portal downgrade timing.

Read-only live catalog inspection confirmed two active products:

| Plan | Product |
| --- | --- |
| Solo | prod_V7NTZj9RBW0JZY |
| Studio | prod_V7NU12jLSoBuBY |

Stripe's [portal configuration documentation](https://docs.stripe.com/customer-management/configure-portal) stated that period-end portal downgrades require prices belonging to the same product. This prompted the isolated test above. The actual provider behavior passed despite product separation; the initial concern is superseded by that evidence.

## Next isolated billing run

1. Use the current master code, fresh disposable PostgreSQL, and explicit Itemize test credentials. Recreate two test products matching the live product separation, with Solo $29/month and $290/year and Studio $49/month and $490/year. Keep outbound application delivery jobs disabled.
2. Use an isolated non-default test portal configuration matching the deployed rules. Create Studio checkout through Itemize's actual provider, complete only a Stripe test payment, and return to the actual local Account plans route. Assert signed webhook processing sets Studio entitlements and the return UI settles correctly.
3. Open that customer's test portal, request Studio-to-Solo, and capture the previewed effective date before confirming. After confirmation, inspect the subscription and any schedule. Before the boundary, Studio must retain access if the promised policy is period-end downgrade. After advancing the test clock through the boundary, Solo must apply once. If the portal applies this cross-product change immediately or refuses it, record failure rather than substituting an API-only downgrade as a passing portal test.
4. Verify a same-plan annual-to-monthly change separately; it shares a product and does not establish cross-plan behavior.
5. Compare previewed and applied proration line amounts using the same effective timestamp, per [Stripe's proration guidance](https://docs.stripe.com/billing/subscriptions/prorations). Assert credit/debit amounts, currency, and when they are collected; comparing only price IDs is insufficient.
6. Verify duplicate and delayed events preserve the provider's canonical state. Retain bounded evidence, then remove only the explicitly created disposable resources.

If the cross-product portal test fails, compare an application-owned scheduled downgrade with a catalog redesign using prices under one product. Assess existing subscriptions and historical price mappings before choosing or deploying either. Do not change live products, subscriptions, or portal policy merely to satisfy the test.

The initial read-only review created no Stripe objects. The later isolated downgrade run above created and cleaned up test-only fixtures. The remaining steps in this test plan have not all been executed.
