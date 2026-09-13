# Email webhook startup recovery - 2026-09-13

## Production backlog attribution

Read-only Resend retrieval of all 18 remaining unmatched provider IDs returned HTTP 200 and delivered status. Fourteen messages were sent by noreply@gleamai.dev and four by noreply@tucsonlovesmusic.com. This establishes these specific events as other-app traffic in the shared Resend account, rather than unresolved Itemize sends. No recipient addresses, message bodies or credentials were retained in this report. No shared webhook settings or other-app records were changed; these events remain quarantined in Itemize.

This attribution does not justify ignoring every unknown provider ID. Future Itemize transactional paths may also lack matching receipts. A separate explicit policy for verified other-app events is still needed to prevent unrelated traffic inflating operational alerts.

The subsequent local implementation and rollout procedure are documented in [shared Resend event classification](shared-resend-event-classification-2026-09-13.md).

## Deployment recovery correction

The prior production verification found two known QA events backed off until the following day after migration 084 had already requeued them. A failed old-runtime attempt during deployment is consistent with the timing. A targeted eligibility update followed by the ordinary worker resolved both without sending another email.

The enabled scheduler now reconsiders known transactional receipt events once when the new runtime starts, before draining the normal queue. It only requeues pending events with unmatched reason and pending/retry/dead-letter reconciliation state. Unknown provider IDs, known ambiguous events, completed events and active claims are untouched. The normal matcher still performs ownership checks; receipt evidence schedules reconsideration and never overrides tenant validation. Retry counters, send attempts, receipt payloads and provider timestamps are not reset.

Recovery failures retry on the next scheduler cycle. Successful recovery is not repeated each minute, preserving ordinary backoff. This is startup recovery, not a guarantee of zero deployment overlap or immediate recovery for receipts first appearing later; those use normal reconciliation cadence.

## Release status

Implementation was committed as 6d86c42d and verified deployed on 2026-09-13 at 17:25 UTC. Regression checks cover once-per-runtime scheduling, recovery failure/retry, known backed-off/dead-letter receipts, unchanged counters, normal delivery resolution, and preservation of unknown, ambiguous and active claims.

Validation: 19 fresh PostgreSQL integration tests and five unit tests passed, along with the backend build and runtime environment contract. The fresh database verified 168 required tables and 163 migration markers. Both integration suites and disposable database cleanup completed successfully; the PowerShell redirected command nevertheless returned exit code 1, without a Jest or runner failure in its log.

All 10 release contract tests passed. Documentation synchronization and diff checks passed.

## Production verification

GitHub CI run 34769124684 passed for 6d86c42d9a97e309a308d479c171d46516096a0a. Railway frontend deployment 6610e32d-a654-4153-b58e-8cc0b63ea0bb and API deployment 0a375fd9-abf7-4e38-86c5-fb9e778e087f both report SUCCESS on that commit, with one active deployment each. API readiness, frontend HTML and script return 200; an unsigned billing webhook returns 400.

Runtime environment confirms the release commit and enabled email reconciliation worker. Logs show its 60-second cadence starting at 16:46:21 UTC and subsequent ordinary retry cycles, with no startup recovery error in the retrieved scheduler logs. No positive recovery count was logged, consistent with no pending known receipt remaining after the earlier operational recovery. This deployment therefore verifies normal startup and preserved state; recovery of a newly deferred known event remains covered by integration tests rather than an artificially modified production fixture.

Invoice delivery 6 and signature delivery 8 in QA organization 14 remain delivered with their original provider timestamps. Both webhook events remain processed/resolved with their original 16:19:28 UTC reconciliation times. Both send jobs retain attempt_count=1. The backlog remains 18 unmatched/retry events with zero known transactional receipt matches. Verification used read-only production queries and generated no new messages or retries.
