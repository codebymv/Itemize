# Live review-request email journey

Verified against production commit 0080601f on 2026-09-13. One email was sent through the normal Itemize review-request form to the explicitly authorized recipient, codebymv@gmail.com, using the existing Itemize QA Launch contact in organization 14. SMS, bulk delivery, public review submission and recovery/failure injection were not exercised.

## Evidence

- Review request 1, delivery 1: sent at 20:29:03.450 UTC with attempt_count=1.
- Resend provider ID: cd59c7c3-6758-456d-b96e-02b21cf60783. A read-only provider GET returned 200 and last_event=delivered.
- Itemize's durable receipt also reports provider_status=delivered and review_required=false. The stored request is encrypted and its HTML exactly matches the provider's retrieved HTML.
- Gmail received the email from Itemize <noreply@itemize.cloud>. Its body contains the explicit QA label and states that no public review or other action is requested.
- The actual provider HTML contains the HTTPS Itemize logo, #2563eb accent, #f1f5f9 background, #ffffff surface, Raleway stack and styled Leave a review CTA. Desktop Gmail visual inspection confirms the branded card, logo, blue top rule/button and muted footer. This is an app-generated transactional email, not a manually composed email sent directly to Resend.

## Findings

The shared shell is applied correctly in this journey. However, the HTML body prints the long capability URL and then repeats it as a button. Keep the link in the plain-text alternative; use the canonical CTA once in the HTML version.

Source inspection also shows that the provider chooses its CTA by extracting the first URL from the message. A custom message containing a URL before the appended review URL can therefore select the wrong button destination. This was not triggered in the live test. A structured canonical review URL should be supplied by the producer, rather than inferred from arbitrary message text. Preserve already-persisted wire payloads during any fix.

The app's request card shows Sent while the receipt and provider show Delivered. Sent accurately describes acceptance, but this surface does not expose the stronger provider outcome that is already available. Delivery outcomes should be presented separately from customer response states such as opened, clicked or completed.

## Limits and follow-up

The CTA and delivery-label fixes are implemented locally in [review-email-polish-2026-09-13.md](review-email-polish-2026-09-13.md). The observations above describe production before that change.

This run verifies one review-request send, provider acceptance, signed webhook outcome, inbox arrival and desktop rendering. It does not establish mobile-email behavior, other client rendering, all sender families or failure recovery. No review link was followed and no public review was posted. The QA record remains identifiable in the app.

Next fix: canonical review CTA and duplicate-link cleanup, followed by customer-visible provider delivery status. Then repeat the review journey and continue the estimate/booking matrix against the existing shared-shell contract in Product/outbound-email-brand-audit.md. Fully custom organization-authored campaign/workflow HTML is an explicit documented exception; it should not be treated as an unresolved branding-policy decision.
