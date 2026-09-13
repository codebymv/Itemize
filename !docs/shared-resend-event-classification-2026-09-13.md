# Shared Resend event classification - 2026-09-13

## Policy

`RESEND_OTHER_APP_SENDERS` lists exact sender mailboxes reserved exclusively for other apps in the shared Resend account. Empty configuration disables classification. The verified current list is `noreply@gleamai.dev,noreply@tucsonlovesmusic.com`. Do not list addresses that Itemize or its customers use to send mail. Validation rejects display-name rules, wildcards, Itemize domains, and the configured Itemize EMAIL_FROM mailbox.

Resend includes `data.from` in [delivery webhook payloads](https://resend.com/docs/webhooks/emails/delivered). Classification uses that field only after the existing raw-body signature verification. It ignores display names and matches the parsed mailbox exactly; unknown addresses, missing/malformed senders, suffix lookalikes and Itemize mail continue through ordinary matching/quarantine. Recipients and subjects never establish ownership.

Before classification, the service checks provider-ID evidence in email logs, campaign recipients, invoice/signature outboxes and durable receipts, plus admin mail, campaign tests, estimates, review requests, trial reminders, direct email jobs, workflow email effects and subscription notifications. Any existing Itemize evidence produces `sender_conflict`, leaving the event pending without updating delivery outcomes or contacts. This also protects send paths that lack normal webhook outcome matching. The reservation of listed mailboxes is required: no lookup can prove an Itemize outbox will not persist evidence later if that sender is incorrectly shared with Itemize.

Verified other-app events are retained with processing_status=ignored, reconciliation_status=not_required and reconciliation_reason=other_application. Their details contain the exact allowlisted sender, evidence source (signed_webhook or resend_api) and classification timestamp. Retry counters and previous errors are retained; scheduling and leases are cleared. They no longer inflate retry/dead-letter queues. Duplicate signed deliveries remain idempotent. Removing a sender rule does not retroactively requeue previously classified history.

## Historical events

Earlier webhook normalization discarded the sender, so the old backlog cannot safely be classified from stored payload details. `backend/scripts/classify-other-app-email-events.cjs` performs fresh authenticated Resend retrieval for each candidate and requires the returned provider ID to exactly match. It prints aggregate outcomes only, without credentials, recipients, subjects or message bodies. Lookup errors, unknown senders, active claims and already completed events are left unchanged. The event is locked and eligibility rechecked after the lookup, avoiding overwriting a worker claim acquired during the request.

The command defaults to dry run and examines at most 100 pending/retry/dead-letter events per invocation. It uses the existing compiled service without bootstrapping AppModule or starting workers. Both container definitions include the script. No schema migration is needed.

## Rollout

After deploying the code, configure the backend Railway variable:

```text
RESEND_OTHER_APP_SENDERS=noreply@gleamai.dev,noreply@tucsonlovesmusic.com
```

Within the deployed backend runtime, use existing DATABASE_URL and RESEND_API_KEY configuration:

```sh
node scripts/classify-other-app-email-events.cjs
node scripts/classify-other-app-email-events.cjs --apply
```

Review the dry-run aggregate before applying. The previous read-only investigation identified 18 other-app events (14 Gleam, four Tucson Loves Music); a fresh lookup is still mandatory for each application. Do not guess if the count changes. Retain unknown/conflicting records for investigation. After applying, verify classified counts/evidence, remaining actionable events and unchanged QA receipt/send-attempt state. Do not alter the shared Resend webhook subscription or other apps.

## Status

Deployed and applied in production on 2026-09-13 as 6bab604b4fbe7a3fe7758d7e6e3423493a1fc61d. The prior production verification notes are preserved in email-webhook-startup-recovery-2026-09-13.md.

Validation passed: 28 fresh PostgreSQL integration tests, 13 unit tests, all 10 release contracts, backend build, script syntax and diff checks. The fresh database verified 168 required tables and 163 migration markers; no migration was added. Tests include invalid signatures, duplicate ignored events, unknown/missing/spoofed senders, Itemize evidence in both logs and an otherwise unmatched outbox, failed/mismatched provider responses, unchanged dry-run/dead-letter history, and a worker acquiring a claim during provider verification. Documentation was synchronized and checked.

## Production result

GitHub CI run 34773056438 passed the full release checks. Railway frontend deployment ac32470e-dd71-4d4b-9feb-a7aef580e696 and API deployment f68eb010-4e3b-4da8-9d07-eb8e18f8227f both report SUCCESS on 6bab604b, with one active deployment per service. Public API readiness, frontend HTML and its script return 200; an unsigned billing webhook returns 400.

The backend runtime confirmed the release commit, packaged backfill command and exact RESEND_OTHER_APP_SENDERS value above. Production dry run returned would_ignore=18 with no verification failures or conflicts. The subsequent --apply invocation performed fresh provider checks again and returned other_application=18. Read-only verification found 14 Gleam and four Tucson Loves Music records retained as ignored/not_required with resend_api evidence. No email webhook records remained in pending, processing, retry or dead_letter reconciliation states.

QA invoice delivery 6 and signature delivery 8 remain delivered with their original provider timestamps and attempt_count=1. No email was sent, no record was deleted, and no shared Resend subscription or other-app configuration was changed. Future signed-event classification is enabled by the runtime sender list and covered by integration tests; this verification did not generate a new provider event merely to exercise it.
