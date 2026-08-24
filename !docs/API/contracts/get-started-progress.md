# Get Started progress contract

**Status:** Implemented  
**Evidence date:** 2026-08-19

This is a new product surface. It is not an extension of feature-tour
onboarding. Do not store Get Started state in `users.onboarding_progress`
or `onboarding_events`.

## Product decision

A first-session path that completes when the workspace has done real work:
a contact, a list, and either an invoice or a deal. Feature-tour modals
(`OnboardingModal` / `ONBOARDING_CONTENT`) stay unchanged.

Signup lands on `/dashboard` after email verify. Today that page shows a
`Welcome to Your Dashboard` tour plus [`FirstRunBanner`](frontend/src/components/FirstRunBanner.tsx)
when `contacts.total === 0` and there are no recent invoices. Dismiss is
`localStorage` (`itemize_first_run_dismissed`). Lists are not in the show
condition even though the copy links to Canvas.

Empty states already push the same actions locally (Contacts, Invoices,
Pipelines). They do not need to change in the first ship.

## Scope: organization

Get Started is **organization-scoped**.

Contacts, invoices, and deals are tenanted by `organization_id` and created
under `@OrganizationScoped()`. A Studio teammate adding the first contact
should complete the step for everyone in that workspace. Switching orgs
must load that org’s progress, not the user’s tour JSON.

Feature tours remain user-scoped per
[onboarding-graphql-cutover.md](./onboarding-graphql-cutover.md).

Lists are mixed: `lists.organization_id` exists, but
`createWorkspaceList` inserts only `user_id`. Dashboard
`workspaceMetrics.lists` counts `WHERE organization_id = $1`, so a new
list can miss the widget. Slice 2 stamps `organization_id` from request
context on list create. That is required for a correct `first_list`
backfill, not a drive-by.

## Milestone allowlist

| Name | Kind | Write hook | Live backfill | UI |
| --- | --- | --- | --- | --- |
| `workspace_ready` | live only | none (org exists at signup) | org row present | shown, always complete |
| `first_contact` | event + live | `ContactsService.create`; also `ContactTransfersRepository` import | `COUNT(contacts) WHERE organization_id` > 0 | shown |
| `first_list` | event + live | `WorkspaceContentService.createList` after org stamp | lists for this org (see list gap) | shown |
| `first_invoice` | event + live | `InvoicesService.create` (draft counts) | `COUNT(invoices) WHERE organization_id` > 0 | folded |
| `first_deal` | event + live | `DealsService.create` | `COUNT(deals) WHERE organization_id` > 0 | folded |

UI shows **four** rows. The money/CRM row is complete when
`first_invoice` **or** `first_deal` is complete. Do not persist a
synthetic `first_money` name.

Calendar and campaign are not in v1.

Deletes do not un-complete a step. Once an event exists or a live count
has been observed, the step stays done. Prefer: on read, if live count > 0
and no event, **lazy-stamp** the event (best-effort). After that, deleting
the last contact does not reopen the card.

Do not require public-form or booking contact inserts for v1. Those still
live in Express (`forms.routes.js`, `bookings.routes.js`) and would miss
the write hook. Live backfill plus lazy-stamp covers them if the org
already has contacts. Chat-widget convert inserts in Nest
(`chat-widget.repository.ts`) — hook it in slice 2 if cheap; otherwise
rely on backfill.

Recording a milestone must **never fail the customer create**. After
successful persist, best-effort upsert; swallow errors (Gleam
`activation-event.service.ts` pattern).

## Storage

New table. Do not reuse `onboarding_events` (user-only, no org, no
dedupe, `feature_key` collides with tour keys like `invoices`).

```text
get_started_milestones
  id              serial pk
  organization_id int not null references organizations(id) on delete cascade
  name            text not null   -- allowlist only
  user_id         int null        -- actor, if any
  source          text not null   -- create_contact | import_csv | create_list | ...
  dedupe_key      text not null unique   -- `${organizationId}:${name}:first`
  properties      jsonb not null default '{}'
  occurred_at     timestamptz not null default now()
  created_at      timestamptz not null default now()
```

First write wins (`ON CONFLICT (dedupe_key) DO NOTHING`). Allowlist
`name` in the service. Sanitize `properties` (ids only; no email, name,
phone, body).

Dismiss is **per user per org**, not org-wide and not `localStorage`:

```text
get_started_dismissals
  organization_id int not null references organizations(id) on delete cascade
  user_id         int not null references users(id) on delete cascade
  dismissed_at    timestamptz not null default now()
  primary key (organization_id, user_id)
```

Hide the card when the current user dismissed it **or** all visible steps
are complete. Ignore `itemize_first_run_dismissed` once the server field
exists (no migration of the old key).

## GraphQL

New types on a Get Started module (or a clearly named addition next to
`OnboardingModule`). Do not add fields to `OnboardingFeatureProgress`.

```graphql
type GetStartedStep {
  id: String!
  completed: Boolean!
  completedAt: DateTime
  href: String!
}

type GetStartedProgress {
  dismissed: Boolean!
  completedCount: Int!
  totalCount: Int!
  steps: [GetStartedStep!]!
}

extend type Query {
  getStartedProgress: GetStartedProgress!
}

extend type Mutation {
  dismissGetStarted: GetStartedProgress!
}
```

- Requires verified `itemize_auth` cookie and the active organization
  (same `@OrganizationScoped()` / request-context org as CRM).
- Mutations require CSRF.
- No client `recordGetStartedMilestone` mutation. Server writes only.
- `steps` is a stable four-row projection:
  `workspace_ready`, `first_contact`, `first_list`, `first_money`
  (`first_money` is the OR of invoice/deal; `id` in the API may be
  `first_money` even though storage uses the two real names).
- Hrefs: `/contacts`, `/canvas`, `/invoices/new` (money row; pipelines
  remain reachable from empty state, not the primary CTA).

## UI chrome

Dashboard only for the first ship. Replace `FirstRunBanner`.

- Sit on card / page chrome. No full-card color wash.
- Track/fill via shared `Progress` (`h-2`, slate track).
- Icon accents via `useStatStyles` circles, not card backgrounds.
- Rows are skippable links. No Gleam-style prerequisite locks.

## Slices

### Slice 1 — storage + query

Ship an empty-progress card reader. No create hooks yet (except
lazy-stamp from live counts, so existing users already look complete).

- `backend/src/db_migrations.js` (or the current Nest migration path):
  `get_started_milestones`, `get_started_dismissals`
- `backend-v2/src/get-started/` (module, repository, service, types,
  resolver) — keep separate from `onboarding/`
- `backend-v2/src/app.module.ts` register module
- `frontend/src/services/getStartedGraphql.ts` + tests
- Dual contract: this file

Not in slice 1: dashboard card, create hooks, list org stamp.

### Slice 2 — write hooks + backfill

- `backend-v2/src/contacts/contacts.service.ts` after successful create
- `backend-v2/src/contact-transfers/contact-transfers.repository.ts`
  after import insert
- `backend-v2/src/invoices/invoices.service.ts` after successful create
- `backend-v2/src/deals/deals.service.ts` after successful create
- `backend-v2/src/workspace-content/workspace-content.service.ts` /
  `workspace-content.repository.ts`: set `organization_id` on list
  create; then record `first_list`
- Optional same-PR: `chat-widget.repository.ts` convert-to-contact
- Get Started service: `recordMilestone` (never throw), read-time
  lazy-stamp from counts
- Tests on each hooked service: create still succeeds if record fails

Not in slice 2: Express form/booking contact inserts, estimates,
recurring invoices, notes/whiteboards as “first list.”

### Slice 3 — dashboard card

- `frontend/src/components/GetStartedCard.tsx` (new)
- `frontend/src/pages/DashboardPage.tsx` swap `FirstRunBanner`
- `frontend/src/components/FirstRunBanner.tsx` delete or make a thin
  wrapper that is unused
- `frontend/src/design-system/index.md` one line: Get Started uses
  `Progress`; do not tint the card

Not in slice 3: empty-state rewrites, calendar/campaign step, Gleam
locks, tour modal changes.

### Later (not first PR)

- Calendar or campaign step
- Express form/booking write hooks (or move those inserts into Nest)
- Empty-state CTAs pointing at the same query
- Stamping `organization_id` on historical lists with NULL org

The activation funnel admin UI is now implemented separately from the
get-started card. It reads durable milestones and commercial evidence through
`adminActivationFunnel`; see `!docs/Product/activation-funnel.md`.

## Gleam lessons kept / dropped

Kept: allowlisted names, org + `dedupe_key`, first-write-wins, never
break the create, progress = events **or** live state, lazy durability.

Dropped: step locking, go-live approval, telephony/payment gates,
founder review, 10-step linear path.
