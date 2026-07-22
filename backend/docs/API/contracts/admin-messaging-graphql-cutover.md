# Admin messaging GraphQL cutover contract

**Status:** Release candidate; production flags default off

**Evidence date:** 2026-07-22

## Decision

Administrator email templates, audit logs, and preview rendering move to `AdminMessagingModule` behind `VITE_ADMIN_MESSAGING_GRAPHQL`. Provider-facing batch delivery moves to `MessagingDeliveryModule` behind the independent `VITE_ADMIN_EMAIL_DELIVERY_GRAPHQL` consumer flag and `ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED` worker flag.

Both modules use database-backed `AdminAccessGuard`; no operation accepts organization context because the surface is intentionally global. Preview and enqueue mutations are CSRF-protected. Disabling delivery does not disable audit/template access, and disabling the scheduler stops provider work without discarding committed intent.

## Read and preview contract

`adminEmailLogs` validates page, limit, and the persisted status vocabulary. Rows and total share a repeatable-read snapshot and use creation-time/ID ordering. List rows deliberately omit stored HTML; `adminEmailLog` returns it only for an explicit positive ID. The admin log iframe and separate preview window sandbox stored HTML so a cross-organization template cannot execute with administrator-page privileges.

`adminEmailTemplates` searches all organizations by bounded category/name/subject inputs, returns a true filtered total, orders by update-time/ID, and returns at most 100 rows. Nullable ownership remains explicit for future system templates even though the current legacy schema requires organization ownership.

`previewAdminEmail` is a bounded pure renderer. It permits only an HTTP(S) base origin, never fetches that URL, substitutes documented sample variables, escapes envelope-owned title/URL values, and performs no provider or database mutation.

## Delivery contract

`enqueueAdminEmailBatch` accepts 1-500 unique normalized email addresses, a 255-character subject, a 500,000-character HTML body, and a safe 128-character idempotency key. It personalizes immutable recipient payloads, then commits the batch, recipient jobs, and queued `email_logs` rows in one transaction. A replay with the same administrator, key, and fingerprint returns the original batch; conflicting reuse fails with `IDEMPOTENCY_KEY_REUSED`. The resolver never calls the provider.

The scheduler leases due recipient jobs for 30 seconds and uses a stable provider idempotency key. Provider rejection retries with bounded exponential backoff and dead-letters after five attempts. A thrown or outcome-unknown provider call becomes `reconciliation_required` and is never automatically resent. Provider acceptance updates the job, its existing audit row, and aggregate batch status in one database transaction.

## Evidence and rollback

Fresh PostgreSQL coverage proves migration-from-zero, anonymous/non-admin denial, global template filters, pure preview, CSRF, atomic intent/log creation, idempotent replay and conflict, provider-free mutation handling, leased provider completion, and list/detail audit projections. Unit coverage freezes validation, personalization, safe idempotency, retry versus reconciliation, and scheduler defaults. Frontend tests freeze the two default-off rollout boundaries and CSRF/query transport selection.

The release-candidate checkpoint passes 365 legacy unit tests, 352 Nest unit tests, 489 legacy PostgreSQL integration tests, 210 Nest PostgreSQL integration tests, and 338 frontend tests. Both production builds compile.

Rollout order is tracked migration `041_admin_email_deliveries` first, default-off GraphQL second, scheduler enablement third, read/preview consumer enablement fourth, and delivery consumer enablement last. Rollback is ordered in reverse: disable delivery consumer, disable scheduler, then disable read/preview consumer. Queued jobs and audit rows remain durable and require no data repair.
