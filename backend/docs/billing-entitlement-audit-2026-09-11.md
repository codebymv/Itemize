# Billing and entitlement audit - 2026-09-11

## Scope and result

Reviewed consistency between advertised plans, checkout, Stripe subscription events,
frontend entitlement checks, public intake, and paid worker claims. This batch closes
confirmed access and configuration defects. It is not a certification of every quota
producer or a live payment lifecycle test. No customer subscription was changed and
no payment was taken. SMS and backup/restore remain outside the authorized scope.

## Corrected defects

- Annual production prices were placeholders. Created live USD recurring prices on
  the existing Itemize products: Solo $290/year and Studio $490/year.
- Enabled the existing annual selector in public pricing and billing settings. Cards
  show the annual commitment and precise monthly equivalent; browsing periods does
  not change the current subscription price display.
- Checkout and signed webhook price maps differed. Both now resolve configured prices
  through the billing catalog, preserving historical aliases and testing quota parity.
- Recoverable subscriptions could start duplicate checkout. All pages of subscriptions
  are searched; active/trialing/past_due/unpaid/paused/incomplete route to the portal.
- Created an isolated, non-default Itemize portal allowing payment details, invoices,
  price changes between the two published plans and cancellation. Cancellation, lower
  amounts, and shorter intervals take effect at period end; other changes use displayed
  prorations. The shared Stripe default configuration was not changed.
- New legacy Studio+ purchases are rejected; existing customers retain portal access.
- Studio now receives the advertised priority-support entitlement. Free status no
  longer counts as a subscribed UI state. Seat copy includes the owner.
- Public forms and calendars now apply the same paid predicate as worker claims.
  Subscription updates serialize with intake. Existing valid attendee management
  capabilities remain usable, and downgrade does not delete published resources.
- One-off invoice failures cannot mark an app subscription past due. Modern Stripe
  invoice parent references are supported. Conflicting customer/subscription identity
  is quarantined through the existing unmatched-event reconciliation path.

## State matrix

| State | Paid access and new public intake | Existing subscription checkout CTA |
| --- | --- | --- |
| Free | Denied; workspace retained | New checkout if no recoverable subscription |
| Paid active | Allowed | Portal |
| Paid trial with future expiry | Allowed | Portal if Stripe subscription exists |
| Expired local trial | Denied; data retained | Checkout or recovery portal |
| past_due / unpaid / paused / incomplete | Denied | Recovery portal |
| Active, cancellation scheduled | Allowed until paid period ends | Portal |
| Terminal subscription deleted | Free limits; data retained | New checkout |

Worker deliveries already queued under paid workflows pause while entitlement is
inactive and resume when paid access returns. This policy was preserved. Booking
status/cancellation uses the existing capability scope and expiry rules independently.

## Stripe configuration

- Solo annual: `price_1UEhDCEHPD0TpM72eqUAxzc8` ($290 USD/year).
- Studio annual: `price_1UEhDDEHPD0TpM72h7kqIDEM` ($490 USD/year).
- Portal: `bpc_1UEhDDEHPD0TpM72pxm9r6g7` (active, not default).
- Monthly live prices checked: Solo $29, Studio $49, matching the catalog.
- Runtime variables: `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_UNLIMITED_YEARLY`,
  `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`. Stage without deploying old code, then
  deploy the matching price-resolution change through the normal CI gate.

## Verification

- Fresh PostgreSQL: 38 tests across five suites passed, including simultaneous trial
  activation and repeat refusal, signed annual upgrade/downgrade events, failed invoices,
  old-subscription refusal, public intake after expiry, and attendee cancellation.
- Frontend: nine focused adapter, entitlement and subscription tests passed.
- Backend: 30 focused unit tests passed, covering provider pagination/recovery routing, portal
  configuration, price-map parity and checkout policy. Release checks and deployed
  verification are recorded separately in the deployment evidence file.
- Provider lifecycle tests use signed synthetic fixtures in disposable PostgreSQL;
  no real subscription was upgraded, downgraded, cancelled or charged for testing.
- Existing app billing notifications use the shared branded transactional renderer.
  No new live billing email or Stripe recovery-email delivery is claimed by this pass.

## Remaining launch work

1. **Contact quota bypass:** public form and booking contact creation inserts directly,
   whereas manual creation checks `contacts_limit`. Audit imports and other contact
   producers together, then enforce a common atomic quota policy. Decide explicitly
   whether a full CRM should reject intake or retain the submission without a contact.
2. **Usage accounting:** reconcile campaign/workflow email producers and resets with
   the advertised allowance; distinguish transactional messages from metered marketing.
   Do not infer universal enforcement from a settings usage meter.
3. **Signature allowance semantics:** current monthly enforcement counts document
   creation, not delivered signature requests. Confirm intended treatment of drafts,
   copies and retries against the advertised 25 e-signatures/month.
4. **Live payment lifecycle:** a full charge/refund/proration journey remains unrun.
   This requires a separately authorized payment test or a dedicated Stripe test setup.
5. Unknown provider prices retain the existing fallback behavior; ensure future catalog
   changes update runtime configuration before offering them in Stripe.

Reference: [Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview).
