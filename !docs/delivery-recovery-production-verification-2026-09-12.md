# Delivery recovery production verification - 2026-09-12

Target commit: 9233732d71bc69025fed497e26aad33dc2f8b4a1.
CI: https://github.com/codebymv/Itemize/actions/runs/34712519092.
API deployment: da5ed689-757d-4bb6-b3fe-7b1f6ac5f5cc.
Frontend deployment: a95975bc-7839-4d86-a415-c5919af1483e.

## Before rollout
- Existing API/frontend health and referenced JS returned 200; unsigned billing webhook returned 400.
- Old API was a3d81d87. Invoice recovery and signature workers enabled.
- Invoice delivery: 5 sent, no outstanding work. Signature delivery: 5 sent, no outstanding work. Signature completion: 1 completed, no outstanding work.
- All 16 admin queue summaries had no pending work except 8 unmatched email.delivered webhook events retrying. These did not match invoice/signature provider IDs. Do not assume their source without evidence; shared Resend account includes other apps and Itemize also sends other transactional mail.
- Browser-created fixtures in QA organization 14: zero-dollar invoice 32 / INV-00002; signature document 16, title [Itemize QA] Delivery recovery 2026-09-12 - no agreement. Both recipients verified as codebymv@gmail.com. One signature first send existed before this journey. No agreement will be signed and no payment made.


## Verified rollout and live sends
- CI passed: 999 backend tests, 1,429 frontend tests, 476 fresh PostgreSQL integration tests, 10 contract tests, lint, builds, bundle budgets and dependency audit gate.
- Both deployments SUCCESS on 9233732d. API migration delivery_recovery_v1 completed at 19:04:16 UTC; migration gate verified 162 markers and 168 tables.
- Old API deployment logged Stopping Container, disappeared from active deployments, and its SSH session closed before QA sends. No pending invoice/signature work was observed before rollover. This verifies the observed rollout; it does not prove a configured zero-overlap policy for future deploys.
- New API logs show invoice recovery every 60 seconds and signature delivery/completion every 60 seconds. Direct-message and social-message delivery remain disabled as before.
- New frontend script /assets/index-p5faURzw.js returned 200; API /health ready; unsigned billing webhook rejected with 400.
- Invoice 32 sent through the deployed editor. Delivery 6, attempt 1, Resend d74491c0-b94c-4589-a49d-e9cecd4f1c2f. Resend GET confirms delivered, authorized recipient, delivery tag. Database confirms encrypted v1 payload and no review flag. Reloaded invoice list shows Sent; its send dialog retrieves Delivery #6 and provider acceptance. No resend submitted.
- Gmail invoice visual review passed: Itemize logo, blue accent, centered white card, shared typography, QA copy and INV-00002.pdf attachment. This was automatically delivered by the app, with QA text supplied through its normal editor.
- Signature document 16 queued through the deployed editor, then worker sent outbox 8 at attempt 1 / claim generation 1. Resend 135db1fc-29ce-46ee-906f-b73974590bbf confirms delivered to the authorized recipient with delivery tag. Database confirms encrypted payload. Reloaded document list changed from Sending to Sent. First-send count increased from 1 to 2; no signature was submitted and no reminders exist for document 16.
- No invoice/signature queue backlog or review-required receipt remained after the sends. Admin queue snapshot contains the email webhook issue below.

## Confirmed follow-up: webhook mapping
Both new email.delivered events reached Itemize but remain unmatched (pending/retry). EmailWebhooksService.loadTargets only searches email_logs and campaign_recipients; the new durable invoice/signature provider receipts are not included. The eight older unmatched delivered events predate this release; the two QA events bring outstanding webhook records to ten. Delivery itself succeeded. Provider acceptance, webhook delivery/bounce reconciliation, and inbox delivery are distinct facts.

Next fix should map transactional receipts tenant-safely into webhook reconciliation, define how confirmed external-app events are ignored, preserve out-of-order/event replay behavior, and reconcile this backlog through the normal worker. Do not force-match unknown shared-account metadata or change unrelated application webhooks.

Scope limits: no live crash/expired-window fault injection, forced resend, admin override, payment, final signing, SMS, or backup drill. Retry/race failures remain covered by the isolated integration tests. Full owner/member/invitation/public-client permission journeys are a separate follow-up.

- Final Gmail signature visual review passed: branded header, blue accent, document card, expiry, Review and sign button and shared footer. Gmail highlighted search terms; these highlights are not part of the email template. The signing link was not opened and no agreement was signed.
