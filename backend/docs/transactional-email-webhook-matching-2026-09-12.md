# Transactional email webhook matching - 2026-09-12

## Problem and correction
Production verification of 9233732d delivered the QA invoice and signature invitation, but their email.delivered webhooks remained unmatched. The webhook matcher only searched email logs and campaign recipients.

The shared matcher now recognizes durable invoice/signature provider receipts. It checks organization ownership across email logs, campaign recipients, receipts and legacy invoice/signature outboxes before writing. Cross-tenant conflicts and unknown provider IDs remain quarantined. Provider IDs from signature-verified webhooks, matched against stored receipts, establish ownership; caller-supplied organization IDs and tags are not used to guess a tenant.

Provider status, event time, delivered/bounced timestamps and the latest applicable provider event are recorded on the durable receipt. The existing timestamp and equal-time status precedence protect against older events. Webhook records retain the matched delivery source and ID. Replay keeps the existing signed Svix delivery-ID deduplication and reconciliation worker.

Invoice status reads now expose nullable providerStatus; the existing send dialog distinguishes delivered, bounced, failed, suppressed, complained, delayed, opened and clicked outcomes from provider acceptance. Signature events are recorded on their receipts; this change does not add signature delivery analytics UI.

Provider events do not modify invoice payment state, signing state, original encrypted payload, retry deadlines, review flags, or send-job attempt counts. No webhook authorizes an additional email. Transactional events are not counted as campaign statistics or used to guess a contact to suppress.

## Migration 084 and backlog recovery
transactional_email_events_v1 adds receipt/event metadata and indexes for provider-ID lookups. Legacy outboxes with a unique known provider ID seed receipt evidence without inventing a payload. Existing receipt rows remain intact. Duplicate provider IDs are not backfilled as an arbitrary match.

Known receipt IDs make pending/retry/dead-letter webhook records immediately eligible for the ordinary worker, including the two production QA messages. Retry counters are not reset and active processing claims are not touched. The migration is repeatable and retains history on code rollback.

The eight older unmatched production events are not automatically classified as other-app traffic. No evidence in this task establishes their source. Unknown events remain quarantined; no shared Resend webhook configuration is changed and no unknown backlog is force-matched or discarded.

## Verification
Regression coverage includes invoice and signature receipt mapping, duplicate delivery IDs, concurrent/out-of-order events, equal-time priority, unchanged encrypted snapshots/deadlines/review flags, cross-tenant collision, event-before-provider-receipt race, migration repeatability, known-only dead-letter recovery, and preservation of a paid invoice. Frontend coverage includes delivered/bounced copy without a retry action.

Final checks passed: 45 fresh PostgreSQL integration tests across webhook receiver, reconciliation worker and invoice suites; 14 focused frontend tests; all 10 release contract tests; both production builds and every bundle budget; frontend lint with zero errors and 55 existing warnings. Fresh schema initialization verified 163 migration markers and 168 required tables. Documentation synchronization and diff checks passed. An initial run passed its 40 executed integration tests but reported a missing worker-suite path; the corrected rerun includes email-webhook-jobs.integration-spec.ts.

## Release status
Local changes only, not committed or deployed. Existing production remains 9233732d. No new live email, payment, signature or webhook event was generated in this implementation pass.

After commit/push and deployment, verify migration marker 163 / 168 required tables, both services on the release commit, and worker reconciliation of QA invoice provider d74491c0-b94c-4589-a49d-e9cecd4f1c2f and signature provider 135db1fc-29ce-46ee-906f-b73974590bbf. Confirm the invoice dialog displays delivered, then inspect the remaining unmatched events without guessing their ownership.
