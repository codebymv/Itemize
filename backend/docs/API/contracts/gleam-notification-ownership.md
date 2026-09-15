# Follow-up notification ownership

Each exported call follow-up has one permanent alert owner. Itemize task creation itself is quiet. The dedicated notification command creates an in-app notification in Itemize's existing notification center; it does not send an Itemize email. Gleam retains its existing owner/admin email fallback.

## Selection and customer behavior

With both handoff export and `ITEMIZE_NOTIFICATION_COORDINATION_ENABLED=true`, a newly created, valid Itemize delivery gives the fallback a two-minute grace period. The handoff, delivery and undecided notification commit together. Missing call context, an unavailable connection, SMS requests and existing notifications keep the Gleam path. The flag never changes ownership of old work.

After a validated applied task receipt, the Itemize notification worker can claim only an undecided, untouched fallback. This competes for the same PostgreSQL row lock as Gleam's email worker. Whichever claims first permanently selects the owner:

- **Itemize wins:** Gleam durably records `ITEMIZE_PENDING` and stops the email fallback before issuing any notification command. Itemize notifies the task's current eligible assignee. If the task is already completed, cancelled or removed, Itemize records that no initial assignment alert is needed.
- **Gleam wins:** The first email preparation selects Gleam, even if preparation later fails or the provider result is uncertain. A later successful task export remains quiet in Itemize. Existing Gleam retries and reviewed email recovery continue to own that alert.

Database constraints enforce ownership and permitted states. Once selected, ownership cannot move between services, including after manual email recovery or a worker restart. The two-minute grace is a minimum opportunity for Itemize, not a delivery SLA: if no email worker has started when a delayed receipt arrives, Itemize may still win.

## Receiver, retries and authority

`POST /api/integrations/gleam/handoffs/:eventId/notify` requires the dedicated `notifications:write` scope signed with the approved connection key. The path identifies an applied receipt in the same connection/generation. Customer input cannot select the recipient, task or notification contents.

Itemize rechecks the active grant and current approving administrator, locks current organization memberships before the task, and validates its assignee. Notification creation, realtime outbox insertion and a durable notification receipt share one transaction. Deduplication is by connection and handoff, across re-emitted event IDs, connection generations and later task reassignment. Replaying a completed decision never alerts a second assignee. Assignment changes and reopening are separate Itemize workflows, not a replay of this initial alert.

Gleam validates the returned receipt against the original task delivery. A dropped response is retried with the same command; it cannot create another notification. Durable five-minute retry scheduling and worker ownership tokens recover crashes and fence late responses. Retries of Itemize-owned commands continue while the integration worker is enabled; failures preserve an unconfirmed state in Recovery. A confirmed receipt records in-app creation, never that a person read it or completed the task.

Local authorization is checked before sending; Itemize checks its own authorization in the receiving transaction. Disconnecting or removing approval blocks subsequent commands. A command already in flight may commit, and its matching receipt remains useful historical evidence. Finishing the notification for an already accepted task is allowed after plan expiry, but creating new tasks retains its entitlement gate.

There is deliberately no automatic switch back to email after Itemize ownership is selected: an unavailable response might mean the in-app alert already committed. A revoked connection or removed assignee can therefore leave an Itemize-owned alert unconfirmed until an administrator resolves the condition. Recovery details show this explicitly and retain the original owner. Do not fix it by resetting ownership or deleting delivery evidence.

## Deployment and verification

1. Apply Itemize migration `091_gleam_notification_ownership` and deploy the new receiver/module first.
2. Apply Gleam migration `20260915130000_itemize_notification_ownership`, regenerate Prisma and deploy all Gleam workers. Old workers must not coexist with enabled undecided notifications because they do not select the new ownership field.
3. Keep `ITEMIZE_NOTIFICATION_COORDINATION_ENABLED` unset until the new receiver and workers are available. The flag controls only new eligibility. `ITEMIZE_HANDOFF_EXPORT_ENABLED` still controls the integration scheduler, including retries of already delegated notifications. Turning off coordination alone does not abandon existing decisions.

No real deployment, migration or rollout flag was changed during implementation. The disposable cross-service suite covers the grace period, a lost response after the in-app alert commits, a Gleam fallback followed by late task delivery, and simultaneous workers selecting one alert owner. Itemize receiver tests cover concurrent replay, current-assignee selection, tenant/scope isolation, closed/deleted tasks, removed membership and transaction rollback. Existing standalone Gleam notification tests remain part of regression verification.

Audited recovery for blocked/exhausted task deliveries is now implemented in Gleam. The next work is better navigation to the exact task and call-detail context. Keep customer rollout disabled until deployment readiness and a deliberately enabled synthetic pilot have been reviewed.
