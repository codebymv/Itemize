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
Deployed and verified on 2026-09-13: both production services run 8077220656846befafe148ffe3d32921b79811cd. GitHub CI run 34742041095 passed. Railway frontend deployment 34344f68-0a07-4bd2-807d-9ea266c83abf and API deployment ac2ce2f4-825d-4002-9a6a-ef9d4e2dac0e both report SUCCESS, with one active deployment per service. API readiness, frontend HTML and its deployed script return 200; an unsigned billing webhook returns 400.

Migration transactional_email_events_v1 completed at 2026-09-13T06:19:15.500Z. The production schema verifier confirms all 163 required migration markers and 168 required tables; production has 169 total public tables.

The QA events initially remained pending despite correct receipt ownership and an enabled reconciliation worker. Both had attempt count 9, an unresolved-mapping error and next attempt 2026-09-14T03:39:26Z. The backoff timing places the last attempt during deployment, shortly after the pre-deploy migration; an old-runtime attempt before replacement is a plausible explanation, not independently proven. Inspection of the deployed matcher returned exactly one organization and the correct receipt for each event.

At 2026-09-13T16:19:15.871Z, a scoped operational update made only these two pending/retry QA events immediately eligible, checking organization 14 and their exact receipt source/IDs. Retry counters were preserved. The normal scheduled worker resolved them at 16:19:28Z: invoice provider d74491c0-b94c-4589-a49d-e9cecd4f1c2f maps to invoice delivery 6; signature provider 135db1fc-29ce-46ee-906f-b73974590bbf maps to signature delivery 8. Both events are processed/resolved and both receipts report delivered with their original September 12 provider timestamps. Both send jobs still have attempt_count=1. No new email or signature was sent.

After reloading the deployed frontend, the QA invoice INV-00002 send dialog visibly showed "Email delivered. Delivery #6". The dialog was cancelled without submitting a resend.

Eighteen other email.delivered events remain unmatched/retry, up from eight at the prior verification. None has a provider-ID match in email logs, campaign recipients, invoice/signature outboxes or durable delivery receipts. Their ownership remains unknown; they were not force-matched, discarded or requeued. Follow-up should trace their originating send paths and address recovery across a deployment overlap before claiming the entire shared-account backlog is healthy.

Subsequent September 13 investigation attributed all 18 events through read-only Resend retrieval to other apps in the shared account. See [startup recovery and backlog attribution](email-webhook-startup-recovery-2026-09-13.md) for the evidence and local recovery correction.
