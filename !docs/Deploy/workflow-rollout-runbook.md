# Workflow rollout and worker ownership

Updated: 2026-09-11. This runbook describes the current NestJS runtime.

## Authoritative owner

`WORKFLOW_NEST_SCHEDULER_ENABLED=true` starts one ordered cycle: schedules,
triggers, enrollments, then side effects. The default interval is 60 seconds,
bounded by `WORKFLOW_NEST_SCHEDULER_INTERVAL_MS`. Each phase retains its database
claims, leases, replay protection, and provider idempotency keys.

The old `WORKFLOW_TRIGGER_JOBS_ENABLED`, `WORKFLOW_ENROLLMENT_JOBS_ENABLED`, and
`WORKFLOW_SIDE_EFFECT_JOBS_ENABLED` flags do not control this scheduler. The
`workflow:rollout:*` npm harness commands were retired with the old runtime and
are not available in the current manifests. Do not use the historical three-flag
disable/drain procedure against NestJS. July staging evidence remains in git
history; it is not evidence about the current production deployment.

Workflow and booking/form notification emails share `workflow_side_effect_outbox`.
Disabling its owner also pauses those transactional notifications. A blank queue
is not proof that the next customer action will be processed.

## Release checks

1. Run `npm run release:check` and the relevant fresh PostgreSQL integration
   suites. CI also runs the complete integration suite.
2. Verify the intended deployment/environment and database independently before
   any staging mutation. Use a dedicated QA organization and approved recipient.
3. Confirm the single intended scheduler owner and inspect pending, retry,
   dead-letter, and reconciliation-required work before activation.
4. Deploy the tested commit through the CI gate. Inspect the startup ownership
   log and cycle summaries, plus oldest due work and failures.
5. Use an ID-scoped QA journey through the app. Require durable state changes,
   provider IDs, recipient delivery/webhook evidence, and the shared email shell
   in actual provider HTML. Do not equate `sent` with inbox delivery.
6. Cancel/deactivate fixtures and verify no unintended pending work remains.

The scheduler stops new ticks and awaits its active cycle in
`beforeApplicationShutdown`, before the shared database pool closes. Abrupt
process termination still depends on durable leases and provider replay safety.

## Pause and recovery

Set `WORKFLOW_NEST_SCHEDULER_ENABLED=false` on the intended service and deploy
that configuration. Confirm old instances have stopped and the new startup log
shows the owner disabled. This pauses processing; it does not cancel enrollment
state or erase queued notifications. Use app lifecycle actions for those changes.

The `jobs:workflow-*` scripts listed in `backend/package.json` are one-shot
entrypoints, not the retired staging safety harness. They bootstrap AppModule
and may start other enabled schedulers (including account deletion). Do not run
them as a parallel production drain while the API owns the queues.

Investigate persisted redacted errors and provider evidence before retrying
terminal work. SMS outcomes requiring reconciliation must not be resent blindly.
After correction, restore only the intended owner, observe the next cycle, and
record the commit, fixture IDs, outcome, and remaining queue state.

See [runtime-and-worker-ownership.md](runtime-and-worker-ownership.md) for all
service flags. SMS and backup/restore work remain excluded from this launch pass.
