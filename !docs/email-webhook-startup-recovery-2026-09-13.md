# Email webhook startup recovery - 2026-09-13

## Production backlog attribution

Read-only Resend retrieval of all 18 remaining unmatched provider IDs returned HTTP 200 and delivered status. Fourteen messages were sent by noreply@gleamai.dev and four by noreply@tucsonlovesmusic.com. This establishes these specific events as other-app traffic in the shared Resend account, rather than unresolved Itemize sends. No recipient addresses, message bodies or credentials were retained in this report. No shared webhook settings or other-app records were changed; these events remain quarantined in Itemize.

This attribution does not justify ignoring every unknown provider ID. Future Itemize transactional paths may also lack matching receipts. A separate explicit policy for verified other-app events is still needed to prevent unrelated traffic inflating operational alerts.

## Deployment recovery correction

The prior production verification found two known QA events backed off until the following day after migration 084 had already requeued them. A failed old-runtime attempt during deployment is consistent with the timing. A targeted eligibility update followed by the ordinary worker resolved both without sending another email.

The enabled scheduler now reconsiders known transactional receipt events once when the new runtime starts, before draining the normal queue. It only requeues pending events with unmatched reason and pending/retry/dead-letter reconciliation state. Unknown provider IDs, known ambiguous events, completed events and active claims are untouched. The normal matcher still performs ownership checks; receipt evidence schedules reconsideration and never overrides tenant validation. Retry counters, send attempts, receipt payloads and provider timestamps are not reset.

Recovery failures retry on the next scheduler cycle. Successful recovery is not repeated each minute, preserving ordinary backoff. This is startup recovery, not a guarantee of zero deployment overlap or immediate recovery for receipts first appearing later; those use normal reconciliation cadence.

## Release status

Implementation is local and not deployed. Production remains 80772206. Regression checks cover once-per-runtime scheduling, recovery failure/retry, known backed-off/dead-letter receipts, unchanged counters, normal delivery resolution, and preservation of unknown, ambiguous and active claims.

Validation: 19 fresh PostgreSQL integration tests and five unit tests passed, along with the backend build and runtime environment contract. The fresh database verified 168 required tables and 163 migration markers. Both integration suites and disposable database cleanup completed successfully; the PowerShell redirected command nevertheless returned exit code 1, without a Jest or runner failure in its log.

All 10 release contract tests passed. Documentation synchronization and diff checks passed.
