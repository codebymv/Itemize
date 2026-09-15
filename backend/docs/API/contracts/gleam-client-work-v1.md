# Client-work integration v1: implementation contract

Date: 2026-09-15. Phase 0 implementation slice.

Implemented: pure event/receipt validators and synthetic fixtures in both backends; truthful Gleam post-call CRM tracing with regression coverage. No integration endpoints, credentials, workers, task mutations or UI are enabled by this slice. The requirements below govern the next implementation slices.

## Contract location and change ownership

Both backends contain `src/integrations/client-work.contract.ts` and `client-work.contract.fixtures.json`. Gleam is the canonical source until these files move to a versioned shared package. Keep the contract and fixture files byte-identical when changing them. Both repositories run the same contract cases using their existing Zod versions (Gleam 3, Itemize 4). Do not make either deployed application depend on a sibling checkout.

Gleam tests: `backend/__tests__/contracts/client-work.contract.test.ts`.
Itemize tests: `backend/src/integrations/client-work.contract.spec.ts`.

The validators are deliberately unregistered pure modules. Shape validation alone is not authorization, tenant isolation, deduplication or proof that a task was committed. Integrate them at the authenticated receiver boundary in Phase 1.

## Events and receipts

All events require schemaVersion 1, UUID event/connection IDs, positive integer connectionGeneration/entityVersion, occurrence time with timezone and an opaque correlation ID. Unknown fields are rejected. Dates are wire timestamps, never local wall-clock dates. Itemize IDs travel as decimal strings within the existing PostgreSQL integer range; Gleam entity IDs remain opaque strings.

| Message | Sender | Payload | Required application behavior |
| --- | --- | --- | --- |
| `gleam.handoff.requested` | Gleam | Stable handoff/call IDs, request time, title, summary, priority, optional existing client ID and optional normalized contact candidate | Create or link one Itemize follow-up under connection policy. Unknown caller may remain unlinked. |
| `itemize.task.updated` | Itemize | Task/handoff/call IDs, current title, client reference, status, assignee, due time and completion time | Update Gleam's task projection only if the entity version is newer and source mapping agrees. |
| Applied handoff receipt | Itemize | Original event/connection/generation, applied time, handoff/task/client identifiers | Emit only after the domain transaction and inbox receipt commit. A queued HTTP acknowledgement is not this receipt. |

Completion requires completedAt; pending, in_progress and cancelled require completedAt null. Reopening clears completedAt and increments entityVersion; audit history retains earlier completion. A completion timestamp does not mean an appointment was booked.

No recording URLs, raw transcripts, arbitrary metadata, tenant-selection fields, credentials or inferred consent are accepted in v1 payloads. The authenticated grant determines the organization. A syntactically valid client/task ID must still be verified within that organization. Phone candidates use international form; do not guess a country when normalization is ambiguous. In that case preserve the request with an unknown candidate rather than dropping the handoff.

## Authorization contract for Phase 1

- Only an accepted owner/admin (or an explicitly equivalent Gleam management permission) in each selected organization may authorize the paired connection. Recheck membership and entitlements at authorization and at mutation time.
- A connection is an immutable organization pair plus a generation. Changing either organization creates a new connection, never retargets pending events. Disconnect/rotation invalidates the previous generation and quarantines pending delivery for review.
- Initial pairing uses a one-time 256-bit code valid for ten minutes, created for an authenticated Itemize manager, target organization and default assignee. Gleam binds its manager's approval and dedicated key to the exact code hash. Itemize verifies this binding through the fixed Gleam peer origin and requires final target-manager approval. Gleam checks the receiver's pinned-key status before activation. There is no browser redirect or shared session in this flow; any future OAuth redirect must separately validate state and the exact registered return URI.
- Use dedicated asymmetric signed, audience-bound service access tokens with a maximum five-minute lifetime. Each receiver verifies the expected issuer, fixed allowed signing algorithm/key set, audience, expiry, connection ID/generation and required scope; it also checks the live grant so revocation does not wait for token expiry. Never trust a key URL supplied by the token.
- Use separate `handoffs:write`, `receipts:read`, and `connection:read` credentials for Gleam -> Itemize. Only `connection:read` can inspect a pending connection; it cannot apply tasks or read receipts. Current task mirroring uses a separate `task-status:read` credential for Gleam -> Itemize, over the same approved key. The reverse `itemize.task.updated` schema remains reserved; no push route is enabled. See the task status reconciliation implementation document. The dedicated `notifications:write` scope permits the initial assignment notification only after Gleam permanently delegates its untouched fallback; it uses a separate idempotent command and receipt. Contact reads and outbound calling require additional grants in later phases. Service credentials may invoke only integration routes, never impersonate a browser user or use browser GraphQL cookies.
- Store long-lived credential material encrypted, rotate it independently of application session signing keys, redact it from traces, and audit connect/disconnect/rotation. Key lifecycle implementation and adversarial authorization tests remain a Phase 1 release gate.
- Add an explicit integration HTTP authorization classification in Itemize's existing boundary tests. Do not classify this as a public route or reuse a generic provider webhook solely to bypass browser auth.

## Delivery, conflict and replay rules

1. Commit Gleam handoff and outgoing event together. Persist immutable serialized payload and its canonical hash; retries reuse that event ID and payload.
2. Receiver verifies grant/direction, validates payload and locks the active connection generation in the application transaction.
3. Unique receipt key is (connection ID, generation, event ID). Same key and same payload returns the existing result. Changed payload is `EVENT_PAYLOAD_CONFLICT` and applies nothing.
4. Add unique source mapping (connection ID, handoff ID) for the Itemize task, independent of generation so credential rotation cannot duplicate tasks. A new event ID for an already-applied handoff cannot create a second task or overwrite staff edits; return the existing mapping, or reject an incompatible call/source identity.
5. Contact resolution/link, call activity, task, mapping and applied receipt commit atomically. Ambiguous candidate matching yields an unlinked task and a visible resolve-client action. Entitlement/quota blocks must be explicit; no side effects are silently skipped while reporting full application.
6. Task mutation, audit and replay receipt commit atomically. The implemented mirror reads complete current task snapshots with monotonic versions, so missed intermediate edits require no outbound event replay. See ITEMIZE_TASK_STATUS.md.
7. Receipt lookup is authorized to the same connection and generation. A response lost after commit is recovered by repeat delivery or receipt lookup, never by creating a new task manually.
8. Stale task versions do not change projections; same version with a different payload is a conflict. Mapping checks also verify task, handoff and call association. Persist rejected/conflicting evidence without logging unnecessary client content.
9. Retry transient failures with bounded exponential backoff and jitter. Authorization, version, payload and identity conflicts need a visible corrective action. Technical diagnostics belong in Gleam Recovery, human next actions in Itemize.
10. Deletion/unlinking leaves source tombstones so replay cannot recreate deleted client relationships. Never move pending data into a newly connected organization automatically.

Proposed application errors: INVALID_EVENT, CONNECTION_REVOKED, SCOPE_FORBIDDEN, EVENT_PAYLOAD_CONFLICT, SOURCE_IDENTITY_CONFLICT, ENTITLEMENT_REQUIRED, CONTACT_LIMIT_REACHED, SERVICE_UNAVAILABLE. Return stable codes and a request ID, not provider credentials or raw database errors. Error response schemas and HTTP mappings belong with the authenticated receiver implementation; they are not yet exported by the validator.

## Itemize task audit and implementation specification

Current schema is created by `db/src/db_crm_migrations.js`: organization required; contact/deal/assignee optional; title length 255; priority low/medium/high/urgent; status pending/in_progress/completed/cancelled; due/completion/reminder/created/updated timestamps. Existing indexes are primarily single-column. No task-specific lifecycle migration was found in the numbered migration directory during this inspection.

Current creator: `backend/src/workflow-jobs/workflow-enrollment-jobs.repository.ts`. Current reader: `backend/src/contacts/contact-profile.repository.ts`. The profile projection omits assignee and update/version information. Frontend `ContactDetailPage.tsx` renders a disabled New task button. The task lifecycle must therefore supply real APIs and an expanded projection, not just enable the button.

`OrganizationContextGuard` resolves organization membership and role; it does not by itself implement task write permissions. Existing workflow assignment checks membership existence. New task lifecycle writes must explicitly validate accepted membership, role and assignee eligibility; do not infer those checks from the organization-scoped decorator.

Proposed task permissions:

| Actor | Read | Create | Edit/complete/reopen/cancel | Assign |
| --- | --- | --- | --- | --- |
| Accepted owner/admin with CRM entitlement | Organization tasks | Yes | Any task | Any eligible accepted non-viewer member |
| Accepted member with CRM entitlement | Organization tasks | Self-assigned or unassigned | Tasks assigned to self | Claim unassigned work; manager handles reassignment |
| Viewer with CRM entitlement | Organization tasks | No | No | No |
| Integration grant | Only dedicated receipt scope | Dedicated ingestion only | No human mutation rights | Connection default owner only |

Service-side mutation transaction must recheck actor membership and lock it consistently before locking the task. Recheck assignee membership in that transaction; invitees, viewers and users from another organization are ineligible. If an assigned member leaves, retain task history and expose it as needing reassignment rather than hiding the work.

Proposed browser GraphQL contract (not implemented):

- `clientTasks(filter, page)` with bounded pagination, deterministic due-date/ID order, assignee/status/overdue/unlinked filters.
- `createClientTask(input, idempotencyKey: String!)` with optional client, eligible owner, title, description, priority and due date. Reuse canonical payload receipt conventions. Identical retries return the same task; conflicting retries fail.
- `updateClientTask(id, expectedVersion, input, idempotencyKey: String!)` for allowed field/assignment edits.
- `transitionClientTask(id, expectedVersion, status, idempotencyKey: String!)` for start/complete/reopen/cancel. Pending/in-progress may complete or cancel; completed/cancelled may reopen to pending. Repeating an unchanged state has no new side effect.
- Include assignee, due/completion time, version, source and updatedAt in task projections. Client detail and the follow-up view consume the same service.

All mutations need OrganizationScoped, CsrfProtected and the existing CRM plan boundary, plus the explicit lifecycle permission checks. Keep the GraphQL create/replay and authorization contract tests passing. A stale expectedVersion returns a conflict with a reload action, never last-write-wins.

Next numbered database migration should add task versioning, task mutation receipts and audit records, and composite indexes for organization/assignee/status/due-date access. Pick the next available migration number when implementing, since another task is changing this repository. Validate legacy null/invalid rows before adding stronger constraints. Add integration mappings/outboxes with the receiver slice rather than exposing unused credentials or endpoints in the task slice.

Before enabling New task, verify actual PostgreSQL concurrency behavior: cross-tenant references, two claimers, stale versions, repeated creates, completion/reopen retries and membership removal during mutation. Then verify the frontend create -> assign -> complete -> reopen journey and accessible pending/error states. Unit schema validation is not a substitute for these tests.

## Notification decision

During the pilot Itemize owns task assignment notifications after committed ingestion; Gleam owns technical failure notices. Existing Gleam owner notifications remain the fallback until this path is enabled. Track whether fallback was already sent and propagate that delivery state through an explicit future notification receipt contract before suppressing or sending an equivalent notice. The current event schema does not implement that coordination; do not enable overlapping notifications without the dedicated delivery test.

## Next release boundary

Implement Itemize's task lifecycle and its client detail/view first. Then add authenticated connection/receiver capabilities before Gleam producer delivery. This slice changes no paid-feature access, invokes no real call or CRM provider, and migrates no database.

## Phase 0 verification

- Gleam: 32 focused tests passed (9 CRM reporting cases, 23 contract cases).
- Itemize: 23 contract cases passed against its own Zod version; backend TypeScript check passed.
- Gleam current backend source built successfully in the isolated verification workspace with the current schema's generated Prisma client. The working checkout's generated client is stale and its direct type check reports missing pre-existing Prisma models; no database migration was run to perform this verification.
- Gleam changed production files passed ESLint with no errors; three existing websocket warnings remain.
- Contract and fixture hashes match between repositories. Itemize's authoritative contract document and generated documentation mirror match. Existing unrelated working-tree edits were preserved.

These checks cover reporting and wire validation, not live integration authorization, database concurrency or customer-facing task behavior. Those remain the explicit Phase 1 gates above.
