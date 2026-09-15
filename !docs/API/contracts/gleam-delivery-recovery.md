# Audited Itemize delivery recovery

Organization owners and administrators can open Recovery → Follow-up requests → request details and retry an eligible blocked or exhausted Itemize delivery. They review the original failure and explain what was corrected. The action queues the original delivery; it does not declare a task created, mark human follow-up complete, or send a new notification.

## Safety boundary

`POST /api/recovery/handoffs/:id/itemize/retry` uses the existing authenticated organization-manager boundary and no-store responses. Its strict input contains only organization ID, the reviewed revision, a UUID idempotency key and a 20–2000 character recovery explanation. Callers cannot supply a replacement event, destination organization, task ID or application receipt.

The transaction locks the request key and original delivery, then checks current local membership, the original active connection/generation, its approving source manager, the required organization plan and the original call/handoff/agent mapping. It accepts only eligible BLOCKED or REVIEW rows with no remaining worker ownership or lease. Pending, sending and applied deliveries cannot be recovered through this action. Deleted tasks, identity conflicts, changed event payloads and missing/invalid original events require investigation rather than a retry button.

An accepted recovery resets the bounded attempt budget, increments a monotonic recovery count, queues the exact same event and commits an audit record atomically. Audit failure rolls everything back. The audit records the actor, explanation, reviewed revision, prior state/attempts and original connection/generation. Recovery details show recent retries; explanations are projected only to administrators.

Every delivery attempt after manual recovery reconciles the original receipt first, even though its attempt budget was reset. Only an explicit `RECEIPT_NOT_FOUND` allows posting the same frozen event. The existing Itemize receiver serializes and deduplicates that identity. A task committed before a lost response is therefore reconciled rather than recreated. Worker ownership fencing still rejects late results from old leases. No stopped-worker confirmation is needed for this action because active leases cannot be recovered and the receiver supports retrying the same operation identity.

Notification ownership and evidence remain unchanged. An earlier Gleam fallback cannot be delegated to Itemize by retrying task delivery, and a recorded task receipt cannot be overwritten through this endpoint.

## Lost responses and stale reviews

The form freezes the original request after an uncertain response and offers “Retry same request.” The same actor/org/request key returns the original queue acknowledgement, even if a worker has subsequently completed or blocked the delivery. That acknowledgement does not assert its current state; the UI reloads delivery details.

Reusing a key with different reviewed content is rejected. A new key with a stale revision is also rejected. The revision includes the recovery count so a later cycle returning to BLOCKED cannot make an earlier review valid again. Switching organization or leaving the request unmounts the form and discards late UI responses.

The action validates local readiness; Itemize independently rechecks its own approval and assignee during delivery. An unresolved remote problem may block the same delivery again. The action does not bypass a revoked connection or move old work to a newly paired organization.

## Deployment and verification

Apply `20260915140000_itemize_delivery_recovery` and regenerate Prisma before deploying the Gleam backend. No Itemize API change is required. New delivery processing still depends on `ITEMIZE_HANDOFF_EXPORT_ENABLED`; queuing recovery while the scheduler is disabled preserves the request for later processing. No production configuration, database or deployment was changed during implementation.

The disposable PostgreSQL suite covers concurrent identical requests, stale revisions, conflicting request keys, current authority, ineligible states, immutable notification ownership, audit rollback and receipt-only recovery of a remotely committed task. UI tests cover review requirements, duplicate submits, uncertain response replay and leaving the reviewed organization/item. HTTP contract tests retain manager-only writes and reject malformed input.

Next: exact task navigation and call-detail context, followed by a deliberately enabled synthetic pilot and deployment readiness review. Customer rollout remains disabled.
