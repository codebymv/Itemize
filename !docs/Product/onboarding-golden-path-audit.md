# Onboarding golden-path audit

## Commercial objective

The first-run experience must move an independent service professional to one
real client-facing send. Free and Solo are separate journeys:

- Free: arrive in the workspace and create the first useful item.
- Solo trial or paid: add a client, create a commercial artifact, and send it.

Only a provider-confirmed estimate, invoice, or signature delivery completes
the Solo journey. Creating a draft or deal is not activation.

## Batch 1 findings and corrections

| Finding | Risk | Correction |
| --- | --- | --- |
| Email verification, ordinary login, and Google signup defaulted to `/dashboard` | Free users arrived at a paid upgrade wall instead of their workspace | Default auth exits now resolve through `/`, where the loaded subscription selects `/canvas` or `/dashboard` |
| The dashboard opened a generic blocking product tour | The tour obscured the one useful first action | Removed dashboard tour triggering; the server-backed next-action card is now the first guidance surface |
| The dashboard checklist mixed Free workspace actions with paid CRM actions | Neither audience received a coherent journey | The server now returns a one-step Free journey or a three-step Solo journey based on the organization plan |
| Creating an invoice or deal completed the former commercial checklist | The UI claimed value before anything reached a client | The final step now reads the authoritative `artifact_sent` activation event |
| Every checklist row was independently clickable | Several equal choices competed for attention | Only the next incomplete step has a CTA; later steps remain visible as orientation |
| The Canvas tour taught three feature groups before asking for work | Free users had to learn the product before receiving value | Canvas onboarding is now a focused two-step chooser that explains every workspace format and starts only the format the user selects |

The Solo default path uses an estimate because it is the lowest-commitment
commercial artifact. If the user creates an invoice or signature document
instead, the send step returns them to that artifact type.

## Verified contract

The PostgreSQL GraphQL integration test covers:

1. A Free organization receives only `first_list`.
2. Switching the organization to Solo produces `first_contact`,
   `first_artifact`, and `first_send`.
3. A real estimate row completes only `first_artifact`.
4. A provider-confirmed `artifact_sent` event completes `first_send`.
5. The checklist routes back to the type of artifact already created.

## Next audit batch

1. Reduce empty-dashboard cost: five analytics families currently load before a
   new workspace has data. Defer secondary analytics until first send or until
   the relevant source data exists.
2. Audit sidebar disclosure during the trial. Growth and automation modules
   should not compete with Clients and Documents during first-run.
3. Add a contextual `Create estimate` action to the client detail page. It
   currently offers `Create Invoice` but skips the default low-commitment path.
4. Measure time and abandonment between first client, first artifact, queued
   delivery, provider-confirmed delivery, recipient response, and paid
   conversion in the administrator funnel.
5. Browser-test fresh Free and Solo accounts at desktop and mobile widths after
   deployment, including Google and email verification exits.

## Production matrix status — August 21, 2026

The email-based Free and Solo golden paths passed against production. Every
fixture used a disposable `codebymv+gold-*` identity and a dedicated personal
organization; no client organization or connected Stripe account was touched.

| Journey | Desktop | Mobile | Production evidence |
| --- | --- | --- | --- |
| Free email signup and verification | Pass | Pass | Branded verification/welcome payloads; post-verification routing opened Canvas |
| Fresh Google OAuth signup | Pass | Pass | Consent-gated account chooser, verified server audience, HttpOnly session, new personal Free workspace, Canvas landing, and Free-scoped navigation |
| Free first workspace action | Pass | Pass | Focused Canvas onboarding exposed the workspace content choices without forcing a list |
| Solo first contact | Pass | Pass | Fresh Solo navigation and contact creation completed without an upgrade dead end |
| Estimate create, send, and recipient response | Pass | Pass | `EST-00001` for `$125.00` delivered, public response completed, and owner notification delivered |
| Estimate-to-invoice handoff | Pass | Pass | Conversion created `INV-00001` while preserving the client and line-item data |
| Invoice delivery | Pass | Pass | Provider-confirmed branded `Your invoice` email; the production service generated and attached its PDF |
| Fresh payment settings | Pass | Pass | The new Solo account loaded the valid Stripe `Not connected` state; the prior load error is isolated to legacy account data |
| Invoice-to-signature handoff | Pass | Pass | Recipient, title, message, and invoice PDF were prefilled; the signature field was assigned to the signer |
| Public signing and completion | Pass | Pass | Branded public shell, one-use capability, signed PDF generation, completed document, and four first-attempt delivery rows |

Production signature document `6` completed with recipient `5`; its completion
job completed on attempt one, and the request, signer-completed, and both
document-completed deliveries were provider-confirmed with no last error. The
one-use public capability correctly stops resolving after the signature is
recorded; recipients retain their branded completion email as the receipt.

The auth email was visually reviewed after the corrected deployment. Its
redundant `Account security notification from Itemize.` footer was removed, and
the newest production welcome payload confirms the shared shell is present and
the removed footer is absent.

Fresh Google-user provisioning was rerun after an authorized greenfield reset.
Production created exactly one Google-verified user, one personal organization,
and one owner membership. The organization is `free` with subscription status
`none` and no trial timestamps; both desktop and mobile routes expose only the
Free workspace scope. This run also reconfirmed the matching Google client ID,
required Terms/Privacy acknowledgement, and the intended Google profile name
for a genuinely new user.

The Free-to-Solo preflight confirmed the retained production workspace still
has no subscription or trial after an abandoned Stripe Checkout. It also
surfaced three release blockers now covered by regression tests: the Free plan's
zero email, SMS, and API entitlements must read `Not included`, not `Unlimited`;
publishing a workspace item must require an explicit confirmation and expose
working copy/open/revoke controls; and the advertised 14-day Solo trial must
start in-app without requiring a card. Trial activation is an owner-only,
organization-scoped, atomic, one-time mutation. The production activation
canary passed after explicit action-time confirmation: the sole workspace moved
from Free/none to Solo/trialing, received a valid 14-day window and the expected
1,000-email/500-SMS limits, unlocked the paid navigation, and created no Stripe
subscription or charge.
While that no-card trial is active (or after it expires), the current Solo card
remains convertible through a `Subscribe to Solo` Stripe Checkout action rather
than becoming a disabled conversion dead end. The post-activation display uses
the customer-facing `Solo` name and the persisted trial start date rather than
the internal `starter` key or an `N/A` placeholder.

### Paid-conversion preflight

The non-charging production preflight verified the live Stripe account, active
monthly Solo and Studio prices, and the subscription webhook endpoint and event
set. The annual price environment values are still placeholders, so annual
billing controls are hidden until real live prices exist.

Application safeguards added during this pass:

- A `checkout=success` URL no longer claims that a plan is active. The success
  modal polls authoritative billing state and requires both a Stripe
  subscription ID and an `active` or `trialing` provider status.
- Existing subscribers are sent to Stripe's hosted billing portal for plan
  changes, where amount and proration can be reviewed. The application no
  longer silently replaces an active subscription's price.
- A same-plan Solo trial-to-paid transition queues the branded subscription
  activation email; true tier upgrades retain their separate notification.
- Customer communications use `Free`, `Solo`, `Studio`, and `Studio+` rather
  than internal plan keys.

No live charge was created during this preflight. Stripe's hosted billing
portal currently has no live configuration, so portal setup and a deliberately
authorized low-value checkout/refund canary remain required before declaring
the paid path production-complete.

The targeted frontend, billing service, webhook worker, legacy PostgreSQL
integration, and production builds pass. The broader backend-v2 integration
suite still contains older fixtures with `subscription_status=none`; those
fixtures now fail the hardened entitlement guard and must be migrated to valid
active or trialing subscriptions before the full suite can serve as a green
release gate.

### Remaining matrix extensions

- A live Stripe checkout/payment remains intentionally deferred until the
  Itemize billing portal is configured and an action-time confirmation is given
  for the charge/refund canary. The matrix did not access or mutate any
  client-owned Stripe account.
- Estimate decline and signature decline are covered by renderer/service tests;
  add production canaries when destructive fixture coverage is next scheduled.

Earlier disposable golden-path fixtures were removed after their evidence was
recorded. The fresh OAuth account is retained as the sole production user for
continued first-run testing. See
[outbound-email-brand-audit.md](outbound-email-brand-audit.md) for the sender
inventory, production cause, and regression gates.
