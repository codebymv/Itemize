# Workspace lists, notes, and whiteboards GraphQL cutover contract

## Scope and ownership

Personal lists, notes, and whiteboards belong to the authenticated user and
are independent of the selected organization. `WorkspaceContentModule` owns
their private reads and reachable CRUD mutations. Public capability reads and
share enable/disable operations remain owned by `PublicSharingModule` and
`WorkspaceSharingModule`.

Each content type has independent default-off read and mutation flags.
Shared-content updates/deletes and private list-canvas events write the domain
change and required Socket.IO projections to the transactional cross-service
outbox atomically. The legacy socket host delivers those rows after commit.

| Legacy read | GraphQL query |
| --- | --- |
| `GET /api/lists` (retained adapter; no active routed page) | `workspaceLists(filter, page)` |
| `GET /api/canvas/lists` | repeated bounded `workspaceLists` pages |
| `GET /api/notes` | `workspaceNotes(filter, page)` |
| `GET /api/whiteboards` | `workspaceWhiteboards(filter, page)` |

| Legacy note write | GraphQL mutation |
| --- | --- |
| `POST /api/notes` | `createWorkspaceNote(input)` |
| `PUT /api/notes/:noteId` and the content/title/category variants | `updateWorkspaceNote(id, input)` |
| `DELETE /api/notes/:noteId` | `deleteWorkspaceNote(id, mutationId)` |

| Legacy whiteboard write | GraphQL mutation |
| --- | --- |
| `POST /api/whiteboards` | `createWorkspaceWhiteboard(input)` |
| `PUT /api/whiteboards/:whiteboardId` | `updateWorkspaceWhiteboard(id, input)` |
| `DELETE /api/whiteboards/:whiteboardId` | `deleteWorkspaceWhiteboard(id, mutationId)` |

| Reachable legacy list write | GraphQL mutation |
| --- | --- |
| `POST /api/lists` | `createWorkspaceList(input)` |
| `PUT /api/lists/:id` | `updateWorkspaceList(id, input)` |
| `DELETE /api/lists/:id` | `deleteWorkspaceList(id, mutationId)` |

| Legacy canvas write | GraphQL mutation |
| --- | --- |
| `PUT /api/canvas/positions` | `batchCanvasPositions(input)` |

## Authentication and transport

- All three queries require the verified `itemize_auth` cookie.
- Resolvers derive `userId` only from verified request context.
- The active organization never changes the result.
- All content mutations require the verified cookie and CSRF header/token pair.
- `VITE_WORKSPACE_LIST_READS_GRAPHQL` controls both list surfaces.
- `VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL` independently controls the three
  reachable list-write service methods.
- `VITE_WORKSPACE_NOTE_READS_GRAPHQL` independently controls note reads.
- `VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL` independently controls all six
  existing note-write service methods.
- `VITE_WORKSPACE_WHITEBOARD_READS_GRAPHQL` controls whiteboard reads.
- `VITE_WORKSPACE_WHITEBOARD_MUTATIONS_GRAPHQL` independently controls
  whiteboard create/update/delete.
- Mixed Canvas position persistence always uses GraphQL and has no REST
  fallback.
- All six flags default to false. Selected GraphQL requests never retry through
  REST after a GraphQL failure.

The retained `UserHome` source uses the shared service adapter and correctly
handles the `{ lists, pagination }` REST envelope. The active `App` router no
longer mounts its legacy `/lists` route, so it is not a shipped browser
consumer. The current Canvas and Contents pages both use the canvas-list
adapter: `GET /api/canvas/lists` on REST or repeated bounded
`workspaceLists` pages on GraphQL. Canvas, Contents, and Global Search load
whiteboards through the shared adapter. Canvas and Contents own the reachable
whiteboard CRUD calls. The active debounced drag path uses
`batchCanvasPositions` for lists, notes, whiteboards, wireframes, and vaults;
the dedicated per-kind position adapters are not shipped call paths.

## Query contract

All three queries return `nodes` plus the shared strict `PageInfo`. Page numbers are
one-indexed, page size is 1-100, and ordering is deterministic:
`updatedAt DESC, id DESC`.

`WorkspaceContentFilterInput` accepts:

- `search`, trimmed and limited to 200 characters;
- `categoryId`, a positive user-owned category ID.

List and whiteboard search match titles. Note search matches title or content.
A category filter is resolved through the authenticated user's category rows
and cannot use another user's identifier.

The GraphQL types expose the private fields used by current consumers:
identity, title/content or canvas JSON, category identity, typed list items,
color, canvas geometry, z-index, sharing state, and timestamps. The frontend
adapter maps camel-case GraphQL fields back to the existing REST-shaped
objects.

## Category identity

Legacy list/note rows store both a category name and an incompletely populated
`category_id`; whiteboards store only the category name. Reads resolve
`categoryId` by joining the row's category name to a category owned by the same
user. They do not trust a foreign or stale stored ID and return null when the
name has no canonical category.

List, note, and whiteboard create/update mutations accept the existing
category-name contract and resolve it case-insensitively to a category owned by
the same user. Lists and notes write the canonical ID/name projection together;
whiteboards write the canonical name and return the resolved ID. Legacy
rollback reads remain compatible with rows created through GraphQL. A create
that resolves to the default `General` category transactionally creates that
canonical category when a brand-new account has no category rows; concurrent
creates converge on the same row. Other unknown category names fail closed.

Canvas `positionX` and `positionY` are finite GraphQL `Float` values.
Fractional coordinates are preserved through validation, PostgreSQL, GraphQL
responses, and retained REST reads. Lists preserve valid negative canvas
coordinates; note coordinates retain their existing non-negative contract.
Width, height, and z-index retain their integer contracts.

`batchCanvasPositions` accepts 1-250 unique type/ID targets. It applies
finite last-write-wins coordinates, rounds wireframe coordinates exactly as
the legacy batch did, and applies width/height only to object types that
support those fields. Unknown, malformed, duplicate, foreign, and missing
targets are reported in the `failed` list without exposing whether a row
belongs to another user. Valid targets commit atomically with any required
shared-list, shared-whiteboard, shared-wireframe, and owner-wireframe
realtime outbox rows.

Whiteboard canvas data must be valid JSON with an object or array root and a
serialized size no larger than 1 MiB. Dimensions are 1-10,000, positions are
finite floats, z-index is a safe integer, and colors are normalized six-digit
hex values.

## Typed list items

List items are returned and mutated as `id`, `text`, and `completed`. Malformed
historical JSON entries are omitted rather than exposed as an invalid GraphQL
value. Writes allow at most 100 items, require unique 1-100 character IDs and
1-500 character trimmed text, require boolean completion state, and cap the
serialized item array at 40,000 bytes so owner/shared realtime projections
remain below the database's 64 KiB outbox boundary.

The reachable UI still sends whole-list snapshots. Each GraphQL update
therefore requires the `updatedAt` value returned by the preceding read/write.
The repository locks the row and compares that revision before changing any
field. A stale snapshot fails with `CONFLICT`,
`reason: STALE_LIST_REVISION`, and `currentUpdatedAt`; it cannot silently
overwrite a newer item edit.

## Mutation status

List, note, and whiteboard create/update/delete are implemented through the
mutations above.
Note updates lock the row, so concurrent disjoint partial updates compose.
List updates combine row locking with the required optimistic revision because
the current consumer replaces the item array. Update/delete clients supply a
UUID mutation ID that becomes part of each stable outbox event key. List
updates atomically enqueue the owner-canvas projection and, when public, the
shared-viewer projection; deletes do the same for both audiences.

Whiteboard updates also require the preceding `updatedAt` revision and
serialize rapid same-whiteboard frontend writes. A stale revision fails with
`CONFLICT`, `reason: STALE_WHITEBOARD_REVISION`, and `currentUpdatedAt`.
Whiteboard drawings may exceed the outbox payload limit, so a shared update
enqueues only `{ id, requires_refetch: true, updated_at }`. The public viewer
then reloads the authoritative retained HTTP projection. Deletes enqueue the
small terminal projection. Migration `029_whiteboard_realtime_outbox` extends
the constrained outbox vocabulary without changing the single socket host.

The following target mutations remain characterized but blocked because no
shipped consumer needs them for this checkpoint:

- dedicated list position/title changes and item add/remove/toggle.

Before enabling the note write flag in a deployed environment:

1. the legacy realtime outbox worker must be enabled and its backlog/failed
   rows monitored;
2. event keys, at-least-once duplicate delivery, dead letters, and
   reconnect/refetch behavior must follow the realtime contract;
3. GraphQL and REST rollback paths must read each other's writes without
   repair;
4. a staging browser rehearsal must pass with the write flag enabled and then
   disabled.

Before enabling the list write flag, the same outbox, rollback, and staging
requirements apply. The code-level atomic outbox and concurrent-edit gates and
the Canvas/Contents staging write-and-rollback rehearsal have passed. A
production enablement still requires a monitored change window with the
realtime outbox worker enabled; the flag remains default-off.

Before enabling either whiteboard flag, Canvas, Contents, Global Search, and
the anonymous shared viewer must pass a staging rehearsal with each flag
enabled and then disabled. The active batch-position REST path stays unchanged.
The code-level user isolation, validation, optimistic concurrency, bounded
refetch projection, worker delivery, and REST rollback gates pass. The
staging rehearsal passed on 2026-07-18; production enablement still requires a
monitored change window and the flags remain default-off.

## Whiteboard code-level gate

The whiteboard slice passed locally on 2026-07-18. A database built from zero
verified migration `029`, then proved deterministic user-scoped reads,
GraphQL create/update/delete visibility through REST, stale-revision rejection,
shared update/delete projections, delivery through the legacy socket worker,
and complete private `200` rollback bodies when a returned ETag is replayed.
The frontend full suite proves independent default-off selection, JSON/casing
mapping, revision preservation, serialized updates, and REST-default behavior.
No deployed environment or production resource was changed.

## Staging read and rollback gate

The independent workspace-read gate passed on 2026-07-18 against GraphQL
deployment `1bb70077-4237-406f-ad33-1e115a79a5ea` through legacy backend
deployment `07a810a1-5979-4508-9f12-317c12ab9d64`. A disposable verified
account created one distinctive list and note through retained REST writes.

With only `VITE_WORKSPACE_LIST_READS_GRAPHQL=true`, both the shipped Canvas and
Contents pages rendered the two fixtures while Railway recorded successful
`WorkspaceLists` operations and `GET /api/notes`; there was no REST list read.
After inverting only the read flags, both pages rendered the same rows while
Railway recorded successful `WorkspaceNotes` operations and
`GET /api/canvas/lists`. With both flags false, both pages still rendered the
fixtures and Railway recorded only `GET /api/canvas/lists` plus
`GET /api/notes`, with no later workspace GraphQL operation. No data repair was
required between phases.

The rehearsal also corrected a stale consumer claim: the retained `UserHome`
and `/lists` service call remain in source, but the active app router does not
mount `/lists`. The browser gate therefore covers the two reachable workspace
surfaces rather than treating dead route source as a shipped consumer.

Cleanup returned zero disposable users, organizations, memberships, lists,
notes, categories, and related outbox rows. Temporary localhost CORS was
removed from both services. Clean post-gate deployments
`fd5f06f0-70eb-4573-9eee-6141e42e6c8d` (legacy backend) and
`296c3ac3-faf0-476c-a502-d46788c11f08` (GraphQL) restore the default staging
configuration. All workspace GraphQL flags remain default-off and production
was untouched.

## Staging mutation and rollback gate

The note-mutation gate passed on 2026-07-18 against GraphQL deployment
`d94ce176-cb73-43aa-ac46-58a430f59a30` through legacy backend deployment
`535b0cd4-5e41-4751-a135-15007afcbdb7`. A disposable verified account used the
real canvas UI with `VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL=true` to create a
note at fractional coordinates, update its title and rich content, create a
second note without any pre-existing categories, and delete the shared note.
An already-open anonymous viewer received both updates and the deletion over
Socket.IO without a reload.

The rehearsal exposed and closed three parity gaps:

- GraphQL integer geometry rejected the fractional coordinates emitted by the
  canvas, so note positions now use validated floats.
- A brand-new account had no category rows even though the UI promises that an
  omitted category uses `General`, so create now self-heals that default
  category transactionally.
- Loading a public page in another tab rotated the shared CSRF cookie and
  invalidated the owner tab's cached header, so the CSRF issuance endpoint now
  reuses an existing cookie.

With only `VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL` changed to `false`, the same
canvas session updated title and content through
`PUT /api/notes/:id/title` and `PUT /api/notes/:id/content`, then deleted
through `DELETE /api/notes/:id`. The writes persisted across a reload and
required no data repair. Railway operation logs distinguish the successful
GraphQL create/update/delete operations from the later REST requests.

Cleanup deleted the disposable user, personal organization, memberships,
categories, notes, and five note outbox rows; explicit verification returned
zero for every fixture class. Temporary localhost CORS and outbox-worker
variables were removed, clean staging deployments
`7f9cce4e-c9e2-45ad-94da-517dad9e27d6` (legacy backend) and
`b8a0546e-96b6-4ec8-82af-0ad1b100bbba` (GraphQL) succeeded, and public
GraphQL readiness returned `ready`. The outbox worker and all workspace
GraphQL frontend flags remain default-off. Production was untouched.

## Staging list mutation and rollback gate

The list-mutation gate passed on 2026-07-18 against GraphQL deployment
`67a436eb-5175-48bc-b1ad-9c5eab74a5ac`. The GraphQL UI phase used legacy
backend deployment `c2c8eb70-c744-4939-827f-a2ac930e3b99`; corrected REST
rollback passed through backend deployment
`afd0a162-e2c6-4b5e-bb66-e92b485aee38`. A disposable verified account used
the real Canvas UI with `VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL=true` to create
a list with the omitted-category `General` fallback, add an item, enable
sharing, update its title, and toggle item completion. Canvas and Contents
rendered the same list. An already-open anonymous viewer received the title
and completion updates over Socket.IO without a reload.

A deliberately stale update using revision
`2026-07-18T17:53:28.615Z` failed with `CONFLICT`,
`reason: STALE_LIST_REVISION`, and current revision
`2026-07-18T17:54:24.960Z`; the stale overwrite did not persist. Before
cleanup, the transactional outbox contained three sent shared-viewer
`listUpdated` projections and four sent owner-canvas `userListUpdated`
projections for the fixture.

Turning the mutation flag off exposed a rollback defect in the personalized
REST reads: a retained browser ETag could make Express return `304` with an
empty Axios response body even though the row still existed. The three
workspace rollback reads now return `Cache-Control: private, no-store` and
ignore conditional request validators. The fresh-PostgreSQL regression replays
each returned ETag and requires HTTP `200` plus the complete list/note body.
With that correction deployed, `GET /api/canvas/lists` returned a full `200`,
the same fixture rendered in Contents, and REST `PUT /api/lists/:id` plus
`DELETE /api/lists/:id` updated the open anonymous viewer in real time. Backend
logs showed only the retained REST reads/writes after rollback, and GraphQL
logs contained no later workspace mutation.

Cleanup removed the disposable user, personal organization, membership,
category, list, and outbox rows; explicit verification returned zero for all
six fixture classes. Temporary localhost CORS and outbox-worker variables were
removed. Clean backend deployment
`e402baa8-6154-4367-aa6d-a560737ad766` succeeded, public GraphQL readiness
returned `ready`, and `EXTRA_CORS_ORIGINS`,
`REALTIME_OUTBOX_WORKER_ENABLED`, and
`VITE_WORKSPACE_LIST_MUTATIONS_GRAPHQL` are unset in staging. All workspace
GraphQL flags remain default-off. Production was untouched.

## Staging whiteboard and rollback gate

The whiteboard gate passed on 2026-07-18 against GraphQL deployment
`7eba9f77-e9e8-4f4a-bac0-3127267efc4f` through legacy backend deployment
`3771549e-20fa-43c1-ac95-7cdbbb376d89`. A disposable verified account used
the real Canvas UI with both whiteboard flags enabled to create a whiteboard,
render it in Canvas and Contents, find it in Global Search, update its title,
and open its anonymous shared viewer. The already-open viewer received the
GraphQL title change without a reload by consuming the bounded refetch
projection and reloading the authoritative public HTTP representation.

The rehearsal exposed two cutover defects. The established whiteboard adapter
returns `{ whiteboards, pagination }`, while Global Search accepted only a
bare array; the consumer now normalizes both shapes and has a focused
regression. The staging backend also runs with production startup semantics,
which deliberately do not apply migrations. Migration `029` had therefore not
been applied even though the source and fresh-database tests were correct. It
was applied explicitly through the deployment environment, its schema marker
and whiteboard outbox constraints were verified, and the production startup
guard now requires `029_whiteboard_realtime_outbox` rather than the older
realtime marker.

With both whiteboard flags false, the same row rendered through REST in Canvas
and Contents and remained searchable through the retained adapter. A REST
title update reached the already-open shared viewer without a reload. REST
deletion removed the owner row and immediately changed the viewer to its
terminal unavailable state; the public endpoint then returned `404`. Rollback
required no data repair.

Cleanup removed the disposable user, personal organization, membership,
category, whiteboard, and related outbox row; explicit verification returned
zero for all six fixture classes. Temporary localhost CORS and worker
variables were removed. Clean backend deployment
`3f180b58-1988-42c5-87be-b187e4c4b924` and GraphQL deployment
`6e5ea4b8-6e9a-4ed8-bc2b-296345188055` succeeded. Backend health and a public
GraphQL schema probe return HTTP `200`; `EXTRA_CORS_ORIGINS` and
`REALTIME_OUTBOX_WORKER_ENABLED` are absent, all frontend workspace flags
remain default-off, and production was untouched.

## Required cutover evidence

- Service tests for strict pagination/filter validation, mapping, malformed
  item handling, and safe dependency errors.
- Fresh PostgreSQL tests for user isolation, deterministic paging, category
  identity repair, title/content search, all four REST rollback reads, note
  create/update/delete, fractional geometry, default-category self-healing,
  CSRF, concurrent partial updates, list create/update/delete, stale list
  revision rejection, whiteboard create/update/delete, stale whiteboard
  revision rejection, bounded shared refetch projection, owner/shared list
  projections, and outbox delivery.
- Frontend tests for independent default-off flags, casing/envelope mapping,
  canvas multi-page reads, list/note/whiteboard mutation mapping,
  granular-update reuse, revision preservation/serialization, and REST-default
  selection.
- A staging browser rehearsal for the shipped Canvas and Contents pages with
  each read flag independently enabled and disabled, plus list and note writes
  with their mutation flags enabled and rolled back. **All reachable workspace
  list, note, and whiteboard reads and writes, including shared-whiteboard
  bounded refetch and REST rollback, passed on 2026-07-18.**
