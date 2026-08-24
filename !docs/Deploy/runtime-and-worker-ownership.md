# Runtime and worker ownership

**Updated:** 2026-08-23

Itemize currently uses a deliberate two-runtime architecture. The retained Express service is the public ingress, migration authority, rollback boundary, and owner of HTTP protocols that have not been retired. It proxies `/graphql` to the NestJS service. NestJS owns the GraphQL schema, migrated domain implementations, selected retained HTTP controllers, and durable workers explicitly enabled in its deployment.

Both runtimes use the same PostgreSQL database. The database contract and single-worker ownership rules are therefore release-critical; the directory names do not represent independent applications or databases.

## Request ownership

| Boundary | Public entry | Implementation owner | Release rule |
| --- | --- | --- | --- |
| Browser GraphQL | Express `POST /graphql` | NestJS `/graphql` over the internal upstream | Express keeps same-origin cookies, rate limiting, and rollback routing until ingress retirement. |
| Authenticated application operations | GraphQL | NestJS modules | Retire an Express consumer only after its semantic and browser gates pass. |
| Webhooks, OAuth callbacks, uploads, downloads, health | Express or an explicitly proxied Nest HTTP controller | Per cutover contract | Preserve exact bytes, redirects, capabilities, and provider URLs. |
| Socket.IO | Current public API origin | Exactly one realtime host | Enable Nest webhook workers that emit events only with the Nest realtime host. |
| Schema migration | Numbered runner in `backend/scripts/migrations` | Express deployment tooling | Apply and verify migrations before dependent code or workers are enabled. |

## Scheduled-worker ownership

These are code defaults, not a claim about current host-dashboard values. Verify deployed values before every transfer.

| Work | Legacy control and default | NestJS control and default | Transfer invariant |
| --- | --- | --- | --- |
| Daily invoice state and recurring generation | `LEGACY_INVOICE_JOBS_ENABLED`, enabled unless `false` | `INVOICE_NEST_JOBS_ENABLED`, off | Disable legacy, deploy, verify its startup log, then enable Nest. |
| Trial-ending reminders | `TRIAL_REMINDER_CRON_ENABLED`, enabled unless `false` | `TRIAL_REMINDER_NEST_JOBS_ENABLED`, off | Migration `063_trial_reminder_deliveries` must exist. Disable legacy before enabling Nest. |
| Signature completion and delivery | `LEGACY_SIGNATURE_REMINDER_JOBS_ENABLED`, enabled unless `false` | `SIGNATURE_JOBS_SCHEDULER_ENABLED`, off | Inspect queues, disable legacy, then enable Nest. |
| Signature file cleanup | `SIGNATURE_FILE_CLEANUP_ENABLED`, off | `SIGNATURE_FILE_CLEANUP_NEST_ENABLED`, off | Choose one scheduler; both use leased and fenced jobs. |
| Estimate email delivery | No competing continuous Express owner | `ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED`, off | Apply its queue migration and enable only in the intended runtime. |
| Review-request delivery | No competing continuous Express owner | `REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED`, off | Enable only after backlog and provider preflight. |
| Admin and direct-message delivery | No competing continuous Express owner | `ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED` and `MESSAGE_DELIVERY_SCHEDULER_ENABLED`, off | Enable independently after queue inspection. |
| Subscription webhook jobs | `SUBSCRIPTION_WEBHOOK_JOBS_ENABLED`, enabled unless `false` | `SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED`, off | Disable legacy before enabling Nest. |
| Email webhook reconciliation | `EMAIL_WEBHOOK_JOBS_ENABLED`, enabled unless `false` | `EMAIL_WEBHOOK_NEST_JOBS_ENABLED`, off | Disable legacy before enabling Nest. |
| Social webhook jobs | `SOCIAL_WEBHOOK_JOBS_ENABLED`, enabled unless `false` | `SOCIAL_WEBHOOK_NEST_JOBS_ENABLED`, off | Disable legacy; enable Nest only beside `REALTIME_HOST_NESTJS_ENABLED=true`. |
| Workflow jobs | Split legacy flags; see workflow contract | `WORKFLOW_NEST_SCHEDULER_ENABLED`, off | Transfer each queue as an ordered change with drain/reconciliation evidence. |

## Deployment sequence

1. Deploy code and required numbered migrations with every new Nest worker flag off.
2. Confirm both readiness endpoints and inspect the queue's processing, retry, dead-letter, and lease-age state.
3. Disable the legacy owner and deploy that runtime first.
4. Verify its startup log records the disabled owner and no new claims appear there.
5. Enable the Nest owner, deploy it, and verify its ownership log plus a bounded canary.
6. Observe provider acceptance, durable completion, retry counts, and duplicate suppression.

Rollback reverses steps 5 and 3: stop the Nest owner first, then restore the legacy owner. Shared durable rows must not require repair.

## Enforced configuration contract

`backend-v2/.env.example` inventories every direct `process.env` read under the NestJS runtime. `npm run config:check --workspace itemize-graphql-api` fails when a new variable is used without documentation. The Nest startup validator rejects malformed booleans and numeric core settings, insecure production core configuration, incompatible social/realtime ownership, and explicit dual-owner combinations in one runtime.

The validator cannot inspect another Railway service's environment. Host-level review and the ordered deployment sequence remain mandatory for cross-service ownership.
