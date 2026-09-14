# Genuine public Stripe webhook delivery — September 14, 2026

## Result

**Passed in an isolated public test environment on baseline `2e24d1f7`.** Stripe delivered its own `customer.subscription.created` event over HTTPS through a temporary ngrok endpoint to Itemize's actual Nest webhook handler. The proxy forwarded the original request body and Stripe-Signature header without signing or replaying them locally.

| Evidence | Result |
| --- | --- |
| Stripe account and mode | Itemize `acct_1U78bFEHPD0TpM72`; test resources only. |
| Temporary endpoint | `we_1UFVkBEHPD0TpM725vFuKgNc`, API version `2026-07-29.dahlia`, subscribed only to `customer.subscription.created`. |
| Genuine provider event | `evt_1UFVlMEHPD0TpM7235zKQ1Ql`, subscription `sub_1UFVlJEHPD0TpM72ufcMD9mS`. |
| Stripe dashboard | **Delivered**, HTTP **200**, September 14 at 02:01:20 MST / 09:01:20 UTC. Response showed `received: true`, `duplicate: false`, `status: processed`, previous plan `free`, new plan `unlimited`. |
| Stored application receipt | Same event ID, processing status `processed`, organization 1, Free → Studio. |
| Persisted entitlements | Active Studio; 10 users, 25,000 contacts, 10,000 emails, 25 workflows. |
| In-app notification | Exactly one `stripe:<event-id>:plan-changed` notification. |
| Public rejection checks | Unsigned request returned 400; unrelated `/graphql` path returned 404. |

Stripe's dashboard independently displayed the delivered event and the same application response. This establishes provider-origin delivery, signature verification using the temporary endpoint's real signing secret, canonical Stripe state lookup, and the correlated persisted application result.

## Isolation and scope

The full current Nest AppModule used a fresh disposable PostgreSQL database initialized from Itemize's migration stream. Only a random webhook path was exposed through ngrok; the API, GraphQL, database, and credential-control form remained loopback-only. Ngrok request inspection was disabled. Delivery workers and unrelated provider credentials were disabled. The existing Stripe test key and newly issued endpoint signing secret were held in memory, not written to the report or runner source.

Creating an actual test-mode Studio subscription with Stripe's `pm_card_visa` generated the event. No real payment occurred. The only email address supplied was the authorized `codebymv@gmail.com`; Itemize outbound delivery workers did not run. No production DB, live Stripe subscription, shared portal configuration, or live webhook was changed.

This closes the **isolated public Stripe-origin delivery** gap. It does not certify the live `api.itemize.cloud` endpoint's Railway networking or signing-secret correspondence. Its empty delivery history remains recorded in the [production configuration review](production-billing-configuration-2026-09-14.md). Other lifecycle event types, public retries, live paid checkout, and exact proration amounts were not exercised by this run.

The ad hoc helper initially queried a nonexistent `status` column; the application receipt column is `processing_status`. That evidence query was corrected, and a separate read-only PostgreSQL assertion verified the receipt, limits, and notification before cleanup. The raw helper report retains error `42703` and its waiting stage from that query; the passing corrected assertions are retained in `tmp/public-stripe-db-evidence.json`. This was a QA-helper defect; application handling already returned 200 and persisted the correct transition.

## Cleanup

The temporary Stripe endpoint and customer `cus_VG1n1mSuG74f9a` were deleted, the subscription canceled, and product `prod_VG1nCKEA1wk9P7` / price `price_1UFVkAEHPD0TpM72eA45MVjZ` archived. Cleanup reported no errors. Stripe retains test event/payment history.

The ngrok tunnel, proxy/control server, Nest app and disposable database stopped. A separate check found no QA container, ngrok process, or listeners on ports 3109, 4040, 55449, 61055 and 61056. Raw receipts and cleanup evidence are in ignored `tmp/public-stripe-report.json`; the ad hoc runner is `tmp/public-stripe-webhook-qa.cjs`.
