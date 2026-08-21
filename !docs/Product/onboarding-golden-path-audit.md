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

The matrix is intentionally halted, not passed.

- [x] Free desktop email signup was accepted and created the correct Free
  workspace/navigation state.
- [x] The post-verification exit resolved to Canvas and presented the focused
  workspace onboarding choice.
- [ ] The received signup email met the branded-email contract. The initial run
  failed because the deployed GraphQL authentication service was older than the
  renderer in source.
- [x] The corrected GraphQL deployment produced a provider-confirmed branded
  verification payload in a disposable canary.
- [ ] Visually inspect a newly received verification email after deployment.
- [ ] Complete Free mobile, Solo desktop/mobile, Google signup, first artifact,
  provider-confirmed send, and recipient-response rows.

The interrupted Free account, the email-brand canary, and both personal
organizations were removed. See [outbound-email-brand-audit.md](outbound-email-brand-audit.md)
for the sender inventory, production cause, and regression gates.
