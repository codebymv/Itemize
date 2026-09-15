# Client task lifecycle

Date: 2026-09-15. Implemented locally; not deployed.

## Customer behavior

Client detail (`/contacts/:id`) now includes a Follow-ups panel and an enabled New task shortcut for eligible members. The contacts page links to the organization-wide view at `/contacts?view=follow-ups`. Both surfaces use the same task API.

Staff can create tasks with title, details, priority, due date/time and assignee; edit tasks; claim unassigned work; complete, cancel and reopen tasks. Filters include All, My tasks, Needs assignment and Overdue. The organization view also includes Without a client. Due dates display in the browser's local timezone. Lists paginate 20 records at a time with deterministic due-date/ID ordering.

Client links use `/contacts/:id#client-tasks`. Exact task links now use `/contacts?view=follow-ups&taskId=<id>&organizationId=<id>`. The focused page validates both IDs and requires the matching active organization before fetching. The optional `clientTasks` filter `taskId` combines with the existing organization predicate and loads an exact task independently of pagination or client linkage. Existing permissions and mutation controls apply; deleted/inaccessible tasks show an unavailable state. New Gleam assignment notifications use this route. Linking an unknown caller to an existing client remains follow-up work.

## Authorization and concurrency

- Queries require the existing CRM plan boundary and accepted organization membership.
- Owner/admin can create, edit, transition and reassign organization tasks.
- Members can create tasks for themselves or leave them unassigned, claim unassigned tasks, and edit/transition tasks assigned to themselves. Reassignment requires a manager.
- Viewers are read-only. Invitees, foreign users and viewers cannot be assignees.
- A task's client must belong to the same organization. Every existing-task lookup includes organization ID.
- Mutation transactions lock and recheck actor/assignee memberships, then lock the task and compare expectedVersion. Competing claims cannot both succeed.
- The Needs assignment view includes tasks assigned to departed/ineligible members; managers can reassign them without losing history.

## GraphQL API

- `clientTasks(filter, page)` returns tasks, pagination, assignee choices and current action permissions.
- `createClientTask(input, idempotencyKey)` creates one task and its audit/receipt atomically.
- `updateClientTask(id, expectedVersion, input, idempotencyKey)` edits fields or assignment.
- `transitionClientTask(id, expectedVersion, status, idempotencyKey)` changes state. Status values are pending, in_progress, completed and cancelled. Completed/cancelled tasks must reopen to pending before another terminal transition.

All mutations are organization-scoped, plan-gated and CSRF-protected. Input validation bounds IDs, text, priorities, dates and replay keys. Completion sets completed_at; reopening clears it while retaining the audit trail.

Replay keys are scoped by organization and actor. A transaction-level advisory lock serializes identical submissions; canonical payload fingerprints reject key reuse with changed intent. Receipts return the original result even if the initial response was lost. New intent against a stale version returns CONFLICT. Failed audit persistence rolls back the task and receipt.

The UI prevents overlapping saves. For an uncertain transport/server result it freezes the submitted request and offers Retry save with the identical payload and key. After a confirmed conflict it refreshes the task list. This retry state is held within the mounted page; it is not a durable browser queue across reloads.

## Database and rollout

Numbered migration `087_client_task_lifecycle.js` delegates to `db/src/db_client_task_migrations.js`; the canonical initializer runs tracked marker `client_task_lifecycle_v1`.

The additive migration introduces tasks.version, client_task_mutation_receipts, client_task_audit, and organization/due/assignee indexes. Existing workflow-created tasks continue to work with version default 1. Historical tasks are not rewritten or given fabricated audit/completion evidence.

Deploy the database migration before the new backend and frontend. Application rollback retains task history and receipts. No integration grant, CRM delivery worker, assignment email or cross-product event publishing is enabled by this change. The Gleam receiver/producer slice must add transactional task events and notification ownership before it is enabled.

## Validation

- Fresh disposable PostgreSQL 16 bootstrap succeeded, including migration marker/schema verification; the task migration also ran twice to verify repeatability.
- Ten PostgreSQL/GraphQL tests cover browser create/list/complete, CSRF and plan checks, duplicate creation, returned-receipt replay, optimistic conflicts, competing claims, tenant and role boundaries, role revocation, audit rollback and filters.
- Five UI tests cover creation/assignment, completion/reopening, identical retry after response loss, viewer access and load-error retry.
- Existing GraphQL authorization and mutation-replay suites pass (five checks).
- Backend TypeScript check passed. Changed frontend files pass ESLint with two pre-existing ContactsPage hook warnings.
- The Vite frontend build succeeded with an isolated environment and temporary output directory.
- A TypeScript baseline comparison against HEAD found the same 162 frontend diagnostics before and after this change, with zero added diagnostics. The full frontend type check is therefore not green; this change does not claim to fix that existing backlog.

Production migrations, real customer data and external providers were not used for these checks.

## Exact navigation verification — September 15, 2026

Eleven task integration tests, twelve focused UI tests and the cross-service HTTP/GraphQL acceptance journey passed. The latter resolves the generated Gleam task URL to the same unlinked Itemize task before exercising completion and reopening. No migration is needed for the optional filter. Deploy this backend and focused route before Gleam publishes the links. Current frontend baseline comparison reports 312 diagnostics before and after, with zero new diagnostics; full frontend type checking remains failing. Expired-login return navigation and mobile completion still need browser rehearsal.
