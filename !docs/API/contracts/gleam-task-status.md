# Itemize human task status in Gleam

Itemize remains the authority for human work. Gleam's Recovery → Follow-up requests → request details shows delivery confirmation separately from the last verified task status and its check time. Staff complete or reopen the task in Itemize. Pending, in progress, completed, cancelled and removed states are supported; no task status changes booking execution or sends a notification.

## Read contract and authority

The initial implementation uses current-state reconciliation, rather than the previously proposed reverse event transport. Gleam signs a short-lived `task-status:read` credential using the dedicated key already approved during pairing. Itemize exposes `GET /api/integrations/gleam/tasks/:eventId`, with `Cache-Control: no-store`. No reverse signing key or browser session is needed. The reserved `itemize.task.updated` event schema is not an enabled push API.

`backend/src/integrations/itemize-task-status.contract.ts` is identical in both repositories. Its strict response binds the connection ID/generation, original event ID, handoff ID, call ID and task ID. `task` contains the positive integer version, status and nullable completion timestamp; `task: null` is a deletion tombstone. The response includes no caller contact details, transcript, task description or arbitrary metadata.

Itemize rechecks the pinned credential, active connection, generation and current approving administrator inside the transaction. A task must be reachable through a receipt and source mapping belonging to that connection and its organization. Other-connection receipt IDs return 404. Existing state remains readable after subscription expiry, like existing delivery receipts; current approval and revocation checks still apply.

Gleam independently validates the response against its applied receipt and original call/handoff mapping. It checks current local approval and source ownership before the request and again before accepting its response. A local disconnect during an in-flight read prevents that result from being applied. Remote revocation prevents subsequent authorized reads; neither side retracts historical evidence already received.

## Durability and freshness

Each applied delivery has durable polling eligibility. A database claim schedules its next check five minutes later, with a random ownership token fencing overlapping processes and late responses. Crashes require no queue reset. The existing 15-second handoff job processes at most ten status reads per sweep; five minutes is a target cadence, not an SLA under backlog or peer outages. Completed and cancelled tasks remain eligible because staff may reopen them.

Itemize migration 090 advances task versions whenever mirrored/business fields change, including direct SQL writers. Existing lifecycle mutations retain their expected-version checks and atomic task/audit/replay receipts. Gleam rejects lower versions and changed payloads at the same version. Identical versions can refresh the last-checked time. Once observed, a deletion tombstone cannot be replaced by an old task snapshot.

A failed, malformed, unauthorized or stale response preserves the previous snapshot and successful check time and records only a safe unavailable code. The UI always says “Last known task status” and displays its timestamp; unavailable checks never become completion or deletion. Intermediate edits need not be delivered because each successful read recovers current state. This is a status mirror, not a cross-service task audit feed.

## Migration and rollout

Apply Itemize `090_gleam_task_status` after migrations 087–089. Apply Gleam `20260915120000_itemize_task_status` after its outbox/pairing migrations and regenerate Prisma. Deploy the receiver first. Status polling shares `ITEMIZE_HANDOFF_EXPORT_ENABLED` and the configured HTTPS Itemize origin/wrapping key ring; disabling that job stops new status reads while retaining the last known state. No real flags, migrations, connections or deployments were changed during implementation.

The disposable cross-service acceptance test now covers actual GraphQL completion and reopening, missed/older/conflicting versions, response failure, local and remote revocation, removed approvers, lost worker ownership and deleted tasks. Receiver tests cover the dedicated scope, tenant isolation and direct-writer version protection. Recovery UI tests distinguish delivery from human status and retain a visible timestamp during failures.

Notification ownership and late-delivery coordination are now implemented; see the notification ownership document. Audited manual delivery recovery is now implemented. Exact task navigation and deployment/pilot readiness remain follow-on work. Customer rollout remains disabled.
