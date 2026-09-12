# Launch convention conformance audit — 2026-09-11

## Scope and conclusion

Reviewed launch changes from `8d745d51` through `daf412a5`, plus the corrections in this report. This is a focused review of touched systems, not certification of every product module. A journey passing functionally is insufficient: it must also use the existing presentation, transport, durability, tenancy, entitlement, validation, and operational contracts.

## Confirmed mismatches and corrections

| Finding | Correction | Evidence |
| --- | --- | --- |
| Booking lifecycle and form notification emails bypassed the strict outbound brand system. | Commit `daf412a5` renders immutable outbox HTML through `brandedTransactionalEmail`, retaining plain-text alternatives and the intentional customer-authored HTML exception. | 15 PostgreSQL integration tests passed; desktop/mobile booking preview inspected; actual Resend payloads for confirmation, reschedule, cancellation, and form notification contained the shared shell and all four delivered. |
| Workflow scheduler stopped its timer without waiting for the running cycle, unlike delivery recovery. | Track the active promise and drain in `BeforeApplicationShutdown`, before database lifecycle closes the pool. | Focused scheduler tests cover overlap prevention, shutdown waiting, no new work after stopping, error recovery, and redacted logging: 7 tests passed across 2 suites. |
| Workflow scheduler logged raw exception stacks, unlike the delivery recovery convention. | Log a generic failure; use persisted redacted queue diagnostics for investigation. | Regression test ensures a provider exception containing recipient data is not emitted. |
| Form submission details displayed numeric field IDs despite the shared form schema containing labels. | Resolve configured labels by string-normalized field ID; preserve unknown historical keys. | Form editor and related frontend tests: 8 tests passed across 4 files. |
| Railway deployed before CI completed. Both application services had Wait for CI disabled. | Enable Check Suites on the API and frontend. | Reviewed and applied exactly two false-to-true setting changes; no staged changes remain. Deployment enforcement must be observed on the next push. |
| CI omitted the existing release contract checks. | Replace its standalone documentation check with `npm run release:contracts`, retaining documentation checks and adding environment/authorization/transport contracts. | The same contract command passed locally before publishing. |
| Operational documentation described retired workflow phase flags and nonexistent rollout commands; security checklist overstated validation coverage. | Rewrite workflow runbook for the current ordered Nest owner; update runtime ownership, form transport contract, and security checklist; label initial launch notes as historical. | Current manifests, scheduler code, production flag booleans, and HTTP headers inspected. Documentation mirror checked during release validation. |

## Conventions reviewed without a new mismatch confirmed

- Campaign preparation retains tenant locks, status/due rechecks, paid entitlement predicates, subscription usage checks, and stable idempotency keys before delivery.
- Campaign statistics derive from tenant-qualified recipient evidence; webhook arrival is distinguished from application aggregation.
- Booking notification insertion remains in the mutation transaction with immutable payloads and idempotency keys; the existing workflow outbox owns delivery and its paid entitlement behavior is unchanged.
- GraphQL limits run before resolver execution and use the established error format. Pagination limits remain a separate responsibility.
- Frontend CSP fixes use the matching locally bundled PDF worker; rich-text fixes remain in the shared editor. No replacement UI system was introduced.
- Current production checks returned HTTP 200 on both origins, HSTS and nosniff on both, and SPA CSP. API health intentionally has no document CSP.
- Runtime booleans confirmed calendar sync, campaign delivery, campaign test recovery, invoice email recovery, invoice logo cleanup, and workflow scheduler enabled. Direct and social message schedulers were disabled/unset.

## Open acceptance gaps

These are not marked passed by this audit:

1. Public booking creation accepts an arbitrary timezone string, while authenticated booking mutations validate IANA timezones. Email rendering now safely falls back to UTC for legacy bad data, but input validation still needs alignment.
2. An already-open public confirmation page retains the old appointment time after an organizer reschedules it. Refresh/reconciliation behavior needs an explicit acceptance test and correction.
3. Invoice dashboard date-only overdue comparisons require comparison with the authoritative backend policy. This is a follow-up concern, not a confirmed billing defect.
4. Hosted public pages inherit frame-ancestors restrictions. Whether iframe embedding is supported needs a clear product contract before changing the policy.
5. Deleted form fields have no immutable label snapshot in old submissions; unknown keys remain visible to avoid hiding data.
6. Full external OAuth, reminders, multi-replica rate limiting, and every product module were not re-certified in this pass. SMS and backup/restore remain explicitly out of scope.

## Required release evidence

Run the repository release gate, preserve unrelated local work, and record CI and deployed commit identities in the verification log. Verify form labels in the deployed application without publishing another form or sending unnecessary mail. A configured CI checkbox alone is not proof that a deployment waited for CI.

Future journey acceptance must include the existing system contract, actual rendered output, durable/provider evidence where applicable, and explicit untested limits. Delivery alone must never stand in for brand conformance.
