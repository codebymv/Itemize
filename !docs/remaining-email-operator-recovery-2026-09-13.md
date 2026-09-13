# Operator recovery for remaining email journeys

Implementation validated locally and prepared for release; production deployment verification is pending. No production email was sent and no production queue was modified.

## Recovery behavior

The existing platform-admin, CSRF-protected reconciliation mutation and Review delivery control now support estimate, review-request email, workflow/booking email and trial-reminder receipts, alongside invoices and signatures. Review queue details expose channel so SMS jobs do not show a Resend action. Workflow webhook/SMS jobs are also excluded. The backend independently enforces email-only recovery.

An operator supplies an existing Resend email ID. A provider GET must verify its ID, Itemize correlation tag, recipient, subject and recognized provider event against the saved encrypted payload. Missing legacy payloads, mismatched evidence, different stored provider IDs, conflicting tenant ownership and active processing leases are rejected. The receipt is rechecked under lock before any update. Invalid or missing processing lease timestamps fail closed.

For the four newly supported sources, verified acceptance is stored before a held job is made eligible for its owning worker again. The original encrypted payload, first-attempt deadline and attempt count are preserved. On its next claim, the durable sender returns the saved provider ID without sending another email, and the worker completes its normal domain bookkeeping. This avoids duplicating estimate status/link handling, review batch finalization or workflow/trial email-log creation in the admin mutation.

Already queued/retrying/sent jobs retain their state on repeat verification. Cancelled jobs remain cancelled. The actor/provider decision is audited once per receipt. A provider bounce/failure event proves provider acceptance, not successful inbox delivery, and does not authorize a replacement send.

Worker eligibility still applies: disabled workers, changed subscription eligibility or expired/changed trials can delay or prevent final bookkeeping. Trial cleanup can cancel an obsolete job while retaining provider evidence. This action does not bypass those rules or provide an unverified resend override. Jobs without an encrypted original snapshot remain held for separate investigation.

## Validation

All 37 fresh PostgreSQL integration tests and 12 frontend tests passed. The full release check passed, including ten contracts, backend/frontend builds, environment validation and frontend bundle budgets. New database cases exercise all four sources, including evidence mismatch, foreign-tenant provider ownership, non-email channels, live/expired leases, repeated verification, cancellation, legacy payload absence, preserved deadlines and cached acceptance with zero provider sends. Existing invoice/admin suites cover regression and authorization behavior. Frontend tests cover source selection, excluded channels/statuses and verification failure.

The initial database run failed in fixture cleanup: the production delete guard rejected cascading deletion of an unresolved review job, contaminating the later global-count fixture. Cleanup now explicitly removes this suite's child delivery before teardown; the same three suites passed on a fresh database. No production guard was weakened.

## Next scope

After deployment, verify admin queue details and run an isolated app-generated recovery journey. Broader user-facing delivery status and visual verification of shared email design remain separate launch tasks. No claim is made that this action can reconstruct legacy evidence or guarantee inbox delivery.
