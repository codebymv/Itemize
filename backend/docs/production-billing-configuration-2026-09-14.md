# Production billing configuration verification — September 14, 2026

## Deployment and health

Commit `2e24d1f7` passed [CI run 34823305767](https://github.com/codebymv/Itemize/actions/runs/34823305767), including contracts, lint, unit/integration tests, both builds, frontend size budgets and the production dependency audit. The preceding run for `1b1cceb0` was canceled by the newer push; Railway's generic skipped/failed-check wording did not indicate a demonstrated test failure.

Both Railway production services subsequently displayed this commit's title as ACTIVE with Deployment successful:

- API: deployment `1e387339-9d30-4696-9686-5b454c1d4ec9`.
- Frontend: deployment `4c18bca1-b241-4213-90f8-112192a40b2b`.

After rollout, `/health` returned 200 with `status: ready`; the frontend HTML and its referenced JavaScript entry returned 200. The unsigned `/api/billing/webhook` probe returned 400. These establish availability and unsigned-request rejection, not successful signed Stripe delivery.

## Configuration observations

Read-only Railway inspection confirmed `FRONTEND_URL=https://itemize.cloud` and `ITEMIZE_SUBSCRIPTION_BILLING_ENABLED=true`. The billing-specific webhook secret variable is present; its value was not revealed or compared. `EXTRA_CORS_ORIGINS` still includes localhost and 127.0.0.1 on port 5173 from earlier QA. No variables were changed in this pass.

The current frontend billing navigation builds checkout success/cancel URLs from the browser origin and `/settings?section=plans`, and the portal return uses that same Plans route. Together with the production frontend origin, this supports the expected production return configuration. The actual hosted return was exercised locally in the [Studio journey](studio-checkout-return-journey-2026-09-14.md); a live paid production return was not performed here.

Stripe's live Itemize account shows active destination `we_1U78ruEHPD0TpM72OAipUQdC`, **Itemize production billing**, pointing to `https://api.itemize.cloud/api/billing/webhook`. API version is `2026-07-29.dahlia`. Its nine subscribed types include all five types handled by the subscription processor: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. The additional subscriptions are `customer.subscription.trial_will_end`, `refund.created`, `refund.failed`, and `refund.updated`.

## Open evidence gap

A subsequent [isolated public delivery run](public-stripe-delivery-2026-09-14.md) passed with a genuine Stripe-origin event and correlated database evidence. That run used a temporary ngrok endpoint and disposable database; the live endpoint observations below remain bounded to this production inspection.

The destination overview showed zero deliveries this week and the Event deliveries tab showed **No event deliveries found**. The displayed 0% error rate therefore supplies no successful-delivery evidence. Public Stripe-origin delivery, signature-secret correspondence and a correlated persisted application outcome remain unverified by this pass.

Close this with a genuine provider-origin event and a matching Itemize receipt/outcome in an appropriately isolated public test environment, or during an explicitly authorized production billing transaction. A locally signed replay or unsigned rejection cannot substitute for that evidence. No live Stripe resource, subscription, portal, or webhook configuration was changed, and no payment was made.
