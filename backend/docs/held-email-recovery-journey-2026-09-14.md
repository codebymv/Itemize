# Held estimate email recovery journey

Result: PASS, bounded. On September 14, 2026, an app-generated estimate email was genuinely held after Resend accepted it. The signed-in admin Operations UI verified the real provider receipt, and the existing worker completed the job without a second send. Application baseline: `29f350bf` (same application code as `2e24d1f7`).

## Environment and fault

The full Nest application and current Vite frontend ran on loopback with a disposable PostgreSQL database initialized from current migrations. Only the authorized recipient, `codebymv@gmail.com`, was allowed. The seeded organization and estimate identified the message as an Itemize QA recovery test requiring no action. The application rendered its existing shared estimate email template; the harness did not compose an email independently.

The real estimate delivery service created and attempted job `1900000000`. A process-local fault rejected exactly one database receipt write after the real Resend send returned HTTP 200. The normal error path placed the job in `reconciliation_required`; the harness did not set the queue status directly. High fixture delivery IDs avoided correlation with existing production job IDs.

The harness counted provider POST attempts and would block a second attempt. This guard was never triggered: exactly one POST occurred.

## Observed recovery

1. Operations showed Estimate emails with one job needing review. Its details displayed job `1900000000`, Reconciliation required, one attempt, and the accepted-but-unsaved receipt explanation.
2. The operator opened Review delivery and submitted actual Resend email ID `53454f8f-1de3-41a3-a693-15fbc348bc79` using Verify provider receipt. The existing authenticated, CSRF-protected mutation performed real provider evidence verification.
3. The UI showed Retrying. The harness invoked the existing estimate scheduler's `runCycle()` once after the verified receipt appeared; automatic scheduler timers were disabled in this isolated environment.
4. The cycle reported one attempted and one sent. Database assertions verified both job and estimate were `sent`, the job retained the same provider ID, and exactly one reconciliation audit row existed. The original encrypted payload hash and first-attempt timestamp were unchanged. The job attempt count became two, while provider sends remained one.
5. A real Resend GET reported `last_event: delivered`. Reloading Operations showed the estimate queue as Healthy.

Local supporting artifacts are `tmp/held-email-report.json` and `tmp/held-email-qa.cjs` (ignored, not release dependencies). Run identifier: `held-email-qa-1789402741257`. First attempt: 16:21:13 UTC; worker completion: 16:25:01 UTC.

## Cleanup and limits

The disposable database/container/volume, local API, frontend and control process were removed or stopped. No listeners remained on ports 3110, 5180, 55450 or 61057. No application code or production queue was changed. The actual QA email remains in the authorized mailbox/provider history; the shared production webhook may receive its event metadata.

This demonstrates a genuine provider acceptance/receipt persistence failure, operator UI recovery and one worker's no-duplicate-send completion. It does not certify an automatic Railway scheduler cycle, every supported delivery source, or a production held-job mutation. Provider delivery is not a new physical-client rendering check. Existing integration tests cover the other sources and rejection cases described in [operator recovery](remaining-email-operator-recovery-2026-09-13.md).
