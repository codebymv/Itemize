# Workflow execution staging rollout

The workflow rollout harness provides three staging-only commands:

```powershell
npm run workflow:rollout:preflight
npm run workflow:rollout:canary
npm run workflow:rollout:drain
```

Each command uses `DATABASE_URL` and writes a timestamped JSON evidence file under `backend/.workflow-rollout-results` unless `WORKFLOW_ROLLOUT_EVIDENCE_DIR` overrides it. Evidence contains IDs, states, counts, thresholds, and provider correlation IDs; it does not include the API key, database URL, recipient address, message body, or durable provider payload.

## Safety boundary

- `WORKFLOW_ROLLOUT_ENVIRONMENT=staging` is mandatory.
- `WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT` must pin the exact host, port, and database name from `DATABASE_URL`.
- A duplicated Railway environment can preserve a literal production `DATABASE_URL` even when it provisions a fresh PostgreSQL service. Rebind the staging backend to the staging database before any query, then require a fingerprint distinct from production.
- Explicit production deployment labels such as `APP_ENV=production` or `RAILWAY_ENVIRONMENT_NAME=production` are refused. `NODE_ENV=production` is allowed because staging commonly uses production framework behavior.
- The canary requires the exact `WORKFLOW_CANARY_CONFIRM=I_CONFIRM_STAGING_SANDBOX_DELIVERY` acknowledgement.
- The drain requires the separate exact `WORKFLOW_DRAIN_CONFIRM=I_CONFIRM_STAGING_DISABLE_AND_DRAIN` acknowledgement.
- The canary claims only its own trigger, enrollment, and provider-outbox IDs. It cannot consume unrelated workflow work.
- The drain is deliberately global. It must run only after all three scheduled workflow flags are explicitly disabled.

## Staging configuration

Set:

```text
WORKFLOW_ROLLOUT_ENVIRONMENT=staging
WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT=<verified staging fingerprint>
WORKFLOW_CANARY_PROVIDER_MODE=sandbox
WORKFLOW_CANARY_ORGANIZATION_ID=<dedicated staging organization ID>
WORKFLOW_CANARY_CREATED_BY_USER_ID=<member/operator user ID>
WORKFLOW_CANARY_EMAIL=<dedicated sandbox recipient>
WORKFLOW_TRIGGER_JOBS_ENABLED=true
WORKFLOW_ENROLLMENT_JOBS_ENABLED=true
WORKFLOW_SIDE_EFFECT_JOBS_ENABLED=true
RESEND_API_KEY=<sandbox key>
EMAIL_FROM=<sandbox verified sender>
```

The provider-mode value is an operator assertion. The application cannot infer from a Resend key whether the account or sending domain is isolated, so verify that the key, sender, and recipient cannot reach customer traffic.

## Executed staging evidence

The harness completed against an isolated Railway staging environment on 2026-07-16:

- the fresh database bootstrap verified 94 expected tables and 61 migration markers, followed by 24/24 deploy migrations;
- preflight passed with all three worker flags enabled and zero pending, dead-letter, failed, or reconciliation-required rows;
- one ID-scoped canary reached `completed` trigger/enrollment states and one `sent` outbox row at `attempt_count = 1`;
- the provider ID matched the durable email-log external ID, using Resend's `delivered+...@resend.dev` test-address facility;
- the canary workflow was deactivated, its contact was marked inactive, and no residual queue work remained;
- after all worker flags were disabled, the confirmed drain completed in one empty cycle.

Evidence files are retained locally in `backend/.workflow-rollout-results`. The staging backend deployment was stopped after the rehearsal; its isolated PostgreSQL service and configuration remain available for the next release exercise. Copied AWS, Gemini, Google, Resend, Sentry, Stripe, and Twilio credentials were then removed from staging, and staging-specific JWT/vault keys were generated. Before another canary, install a staging-scoped Resend key, confirm the test recipient/sender, redeploy the backend, and enable the three workflow flags only for the rehearsal window.

Generate the database identity without connecting to PostgreSQL:

```powershell
npm run workflow:rollout:identity
```

Compare its host, port, and database name with the staging deployment record. Only after that independent check should its fingerprint be copied into `WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT`. Preflight, canary, and drain fail if `DATABASE_URL` later points anywhere else.

Optional thresholds default to:

```text
WORKFLOW_ROLLOUT_MAX_PENDING_AGE_SECONDS=300
WORKFLOW_ROLLOUT_MAX_DEAD_LETTERS=0
WORKFLOW_ROLLOUT_MAX_RECONCILIATION_REQUIRED=0
```

Raise a threshold only after recording and assigning the existing rows. A passing preflight verifies migration `workflow_sms_reconciliation`, required reconciliation columns, enabled worker flags, provider configuration, queue age, dead letters, and unresolved SMS outcomes.

## Canary

First run:

```powershell
npm run workflow:rollout:preflight
```

When it returns `ok: true`, add:

```text
WORKFLOW_CANARY_CONFIRM=I_CONFIRM_STAGING_SANDBOX_DELIVERY
```

Then run:

```powershell
npm run workflow:rollout:canary
```

The canary creates a uniquely named manual workflow, template, contact, and targeted durable trigger in the selected staging organization. It then invokes the production trigger, enrollment, and email-delivery workers against only those IDs. Success requires:

- one completed trigger;
- one completed enrollment;
- one sent outbox row with `attempt_count = 1`;
- matching provider IDs in the outbox and email log.

The temporary workflow is deactivated and its contact is marked inactive in a `finally` block. Database evidence remains available for audit, while the JSON evidence file records the run ID and correlated row IDs.

## Canary alert checks

Before enabling customer-like staging traffic, confirm alerts or dashboards cover:

- oldest trigger and side-effect queue age;
- due and failed enrollments;
- trigger and provider dead letters;
- SMS `reconciliation_required`;
- provider failure/retry rate;
- scheduler cycle failures.

Assign named ownership for dead-letter retry and SMS accepted-SID/resend decisions.

## Disable and drain rehearsal

Disable all scheduled phases in the staging deployment and restart it:

```text
WORKFLOW_TRIGGER_JOBS_ENABLED=false
WORKFLOW_ENROLLMENT_JOBS_ENABLED=false
WORKFLOW_SIDE_EFFECT_JOBS_ENABLED=false
```

Confirm no old instance still has workers enabled. Then set:

```text
WORKFLOW_DRAIN_CONFIRM=I_CONFIRM_STAGING_DISABLE_AND_DRAIN
```

Run:

```powershell
npm run workflow:rollout:drain
```

The command manually delivers globally due provider work in bounded batches. It does not create new trigger fan-out or execute enrollments. It exits unsuccessfully while queued, retrying, or processing provider work remains. Future-dated retries, dead letters, and reconciliation-required SMS require explicit operator handling rather than forced replay.

After the rehearsal:

1. review the evidence JSON;
2. verify queue and provider dashboards;
3. resolve or assign all terminal rows;
4. restore only the intended rollout flags;
5. record the operator, deployment version, timestamps, evidence path, and rollback result.
