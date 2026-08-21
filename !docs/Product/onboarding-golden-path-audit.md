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
| The Canvas tour taught three feature groups before asking for work | Free users had to learn the product before receiving value | Canvas onboarding is now one step and opens the first-list editor when completed |

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
| Google OAuth existing-account sign-in | Pass | Pass | Correct Itemize client/origin, verified server audience, HttpOnly session, Canvas landing, and Free-scoped navigation |
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

### Remaining matrix extensions

- Google OAuth sign-in against an existing account passed. The run exposed and
  closed two production gaps: GraphQL was missing the matching Google client ID,
  and Google registration could bypass the Terms/Privacy acknowledgement. The
  account-linking path now also preserves the user's existing Itemize display
  name instead of replacing it with the Google profile name. Fresh Google-user
  provisioning still needs one genuinely disposable Google identity.
- A live Stripe checkout/payment is intentionally deferred until the Itemize
  Stripe account review and connection are complete. The matrix did not access
  or mutate any client-owned Stripe account.
- Estimate decline and signature decline are covered by renderer/service tests;
  add production canaries when destructive fixture coverage is next scheduled.

All golden-path users and their personal organizations are removed after the
evidence is recorded. See [outbound-email-brand-audit.md](outbound-email-brand-audit.md)
for the sender inventory, production cause, and regression gates.
