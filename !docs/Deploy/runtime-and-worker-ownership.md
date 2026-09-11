# Runtime and worker ownership

Updated: 2026-09-11.

The Express application was retired on 2026-08-24. Railway runs the NestJS API at api.itemize.cloud, the frontend static server at itemize.cloud, PostgreSQL, and the signature malware scanner. The Nest adapter still uses Express internally; there is no separate legacy ingress.

## Deployment

The API service uses the repository root and backend/Dockerfile.railway. The image installs the backend and database workspaces from the root package-lock.json with npm ci. The frontend is built separately from frontend/ and its own lockfile. Both lockfiles must be updated when a shared frontend dependency changes.

The API pre-deploy command is npm --prefix /app/db run migrate. Schema authority lives in db/. The healthcheck is /health. Railway production was verified to have one API replica, no API cron schedule, and serverless disabled.

## Worker ownership

Flags remain default-off intentionally. Enabling a worker can deliver messages, modify provider state, or process old work. Inspect its queue and provider configuration before enabling it. The startup summary lists enabled and disabled runtime workers. The account-deletion worker runs automatically. Historical conflict flags remain accepted for configuration compatibility; they do not launch a legacy runtime.

The Railway Variables page was inspected on 2026-09-11. The following values were read as true:

- INVOICE_NEST_JOBS_ENABLED
- TRIAL_REMINDER_NEST_JOBS_ENABLED
- SIGNATURE_JOBS_SCHEDULER_ENABLED
- SIGNATURE_FILE_CLEANUP_NEST_ENABLED
- ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED
- REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED
- EMAIL_WEBHOOK_NEST_JOBS_ENABLED
- SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED
- SOCIAL_WEBHOOK_NEST_JOBS_ENABLED
- WORKFLOW_NEST_SCHEDULER_ENABLED
- REALTIME_HOST_NESTJS_ENABLED

ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED was also verified true through the running service. An authenticated S3 HeadBucket request from that service succeeded.

CALENDAR_SYNC_NEST_JOBS_ENABLED, MESSAGE_DELIVERY_SCHEDULER_ENABLED, and SOCIAL_MESSAGE_DELIVERY_SCHEDULER_ENABLED were absent from the service variable inventory. No separate worker services were present in this Railway project.

The delivery-recovery module now provides explicit, default-off ownership flags:

- CAMPAIGN_DELIVERY_SCHEDULER_ENABLED: every minute, promote up to 25 due scheduled campaigns through the existing entitlement/usage transaction, then process up to 100 recipients.
- CAMPAIGN_TEST_EMAIL_RECOVERY_ENABLED: every minute, recover up to 25 test-email deliveries.
- INVOICE_EMAIL_RECOVERY_ENABLED: every minute, recover up to 25 invoice-email deliveries.
- INVOICE_LOGO_CLEANUP_SCHEDULER_ENABLED: every hour, process up to 25 superseded-logo deletion jobs.

Campaign scheduling rechecks status and due time under the campaign row lock. The stable scheduled-campaign intent key prevents duplicate recipient snapshots and usage reservations across overlapping processes. Each cadence prevents local overlap, runs independently, and drains active work before the database shutdown hook. Existing queue claims and provider idempotency remain authoritative. Blocked scheduled campaigns are reported in cycle summaries and remain scheduled for operator correction.

The invoice daily worker handles invoice state/recurrence; invoice email retry ownership is separate. Do not also schedule one-shot commands for queues owned by the live API. Those older commands bootstrap AppModule and can start unrelated schedulers when they inherit production flags, including the always-on account-deletion worker; use the continuous API owner instead. This change does not establish safe horizontal scaling for every existing worker.

Read-only SQL on 2026-09-11 found zero rows in calendar_sync_jobs, message_delivery_jobs, campaign_delivery_jobs, and social_message_delivery_jobs. invoice_email_deliveries contained four sent rows. This is a point-in-time queue observation, not provider-delivery verification.

## Runtime requirements

Production requires HTTPS FRONTEND_URL, DATABASE_URL, a JWT_SECRET of at least 32 characters, and AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION. Missing shared storage now prevents startup. The storage providers also reject production writes to local disk.

ITEMIZE_SUBSCRIPTION_BILLING_ENABLED was verified true. Preserve this deliberate billing control. AWS variable names and both Sentry DSN variable names were present; their values were not exposed or copied.

The environment contract remains backend/.env.example; run npm run config:check --workspace itemize-graphql-api. Before scaling, replace the in-memory auth/API rate-limit stores and review every scheduler's lease/idempotency behavior, including overlap during deployment.

## Rollout checks

1. Confirm migration gate and current environment requirements.
2. Run release:check and release:integration locally.
3. Deploy the tested code and inspect worker startup summaries.
4. Verify headers on both public origins, normal GraphQL operations, Google sign-in, public widgets, PDF downloads, and provider reconciliation.
5. Keep a rollback image available. Do not assume restoring old application code reverses migrations or external deliveries.
