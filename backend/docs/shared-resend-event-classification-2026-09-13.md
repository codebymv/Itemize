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

Implementation and rollout tooling are local, not yet committed or deployed. The existing 18 production records and Railway configuration have not been changed in this implementation pass. Production remains 6d86c42d. The prior production verification notes are preserved in email-webhook-startup-recovery-2026-09-13.md.

Validation passed: 28 fresh PostgreSQL integration tests, 13 unit tests, all 10 release contracts, backend build, script syntax and diff checks. The fresh database verified 168 required tables and 163 migration markers; no migration was added. Tests include invalid signatures, duplicate ignored events, unknown/missing/spoofed senders, Itemize evidence in both logs and an otherwise unmatched outbox, failed/mismatched provider responses, unchanged dry-run/dead-letter history, and a worker acquiring a claim during provider verification. Documentation was synchronized and checked.
