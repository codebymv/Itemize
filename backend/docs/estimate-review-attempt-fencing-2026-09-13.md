# Estimate and review-request attempt fencing

Implementation validated locally and prepared for release; production deployment verification is pending.

## Problem and change

Both delivery queues reclaim processing jobs after a 30-second lease expires. The previous estimate completion/failure methods checked only organization and delivery ID; review methods also required processing status but did not distinguish attempt generations. A delayed callback from the first worker could therefore complete or fail the second worker's claim. Estimate failure could also overwrite an already-sent row.

Completion and failure now require the claimed attempt count and processing status. Estimate completion checks under its existing row lock before updating the estimate or revoking previous public capabilities. Estimate failure uses an atomic conditional update and returns the current tenant-scoped row when ignored. Review completion/failure use atomic conditional updates before changing request flags or finalizing batches. Review completion returns whether it actually applied, so stale worker results do not inflate the worker's sent count.

Estimate activation is recorded only for a sent result belonging to the same claim generation. Terminal outcomes retain their original provider evidence. No migration, email template change or new provider send is required. This follows the existing invoice attempt-fencing convention.

## Validation

Eleven service unit tests and 38 fresh PostgreSQL integration tests passed, including invoice and public-reputation regression suites. Four estimate-service cases check activation ownership. Five new database cases cover all three estimate delivery types and both review channels. They simulate lease expiry and a new claim, then invoke old callbacks and compare delivery/request/batch state. They also cover tenant mismatch, normal completion/rejection, late callbacks after terminal state, and estimate public-link revocation only by the owning attempt. SMS tests exercise repository state only; no SMS provider is configured or contacted.

All ten release contracts, the backend build, environment contract, documentation sync/check and diff whitespace check passed. No production email was generated.

## Release follow-up

Deploy and verify this slice after committing it. Durable receipt release db39649b is tracked separately in remaining-email-durable-recovery-2026-09-13.md. The remaining work includes operator reconciliation for the newer receipt sources, user-facing delivery status, and visual validation of shared email conventions. This change prevents stale database writes; it does not introduce exactly-once delivery guarantees.
