# Outbound email brand audit

## Contract

Itemize-generated email must use the shared transactional shell: HTTPS Itemize
logo, blue top rule and CTA token, slate page background, white bordered surface,
Raleway-first type stack, and muted footer. A deployment is not considered
email-ready merely because the template exists in source; the provider payload
from the deployed sender must contain the shell.

Organization-authored campaigns and workflow templates are the deliberate
exception. Their content and sender identity belong to the organization. Simple
templates still receive the Itemize shell, while an explicitly complete HTML
document remains customer-controlled. This exception does not apply to account,
billing, artifact, security, signature, reputation, or Itemize administrator
notices.

## Sender inventory (August 21, 2026)

| Family | Active renderer | Result |
| --- | --- | --- |
| Account verification, welcome, password reset/change | GraphQL `AuthEmailService` | Shared shell |
| Estimate delivery and recipient-response notice | GraphQL estimate delivery service | Shared shell |
| Invoice delivery and preview | GraphQL invoice delivery/preview services | Shared shell |
| Signature request, reminder, completion, decline | GraphQL signature renderer; retained signature wrapper | Shared shell |
| Review request | GraphQL reputation provider | Shared shell |
| Subscription upgrade and trial lifecycle | Retained transactional helper | Shared shell |
| Itemize administrator email | GraphQL admin renderer | Shared shell; complete HTML can no longer bypass it |
| Retained invoice, template, workflow, and contact-email paths | Retained template wrapper | Routed through the shared shell for app-generated/simple content |
| Organization campaign/test campaign | Organization-authored HTML | Deliberate custom-content boundary |
| Organization workflow complete-document template | Organization-authored HTML | Deliberate custom-content boundary |

## Production incident and verification

The golden-path matrix was halted when a production signup delivered a plain
verification email. Source already contained the branded renderer, but the
GraphQL authentication deployment predated that change. The GraphQL service was
redeployed as `f2442502-5b1d-4a01-b50d-5d8c8f33e18e`.

A disposable post-deploy signup was checked through Resend provider metadata and
HTML, without opening the recipient inbox. The payload contained the document
shell, `https://itemize.cloud/cover.png`, `#2563eb`, `#f1f5f9`, `#ffffff`, and
the styled verification CTA. The disposable user and its personal organization
were then deleted.

## Regression gates

- GraphQL renderer/provider coverage: auth, estimate, invoice, signature,
  reputation, administrator, workflow, and the shared primitive.
- Retained-backend coverage: canonical wrapper, marketing unsubscribe link,
  subscription notification, and HTTPS production asset fallback.
- Before resuming the matrix, create a fresh account and visually inspect one
  received verification email in both desktop and mobile Gmail rendering.
- Release deployments that change an email renderer must deploy every service
  that owns a sender; frontend-only success is not sufficient evidence.
