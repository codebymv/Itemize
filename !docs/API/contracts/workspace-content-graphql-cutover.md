# Workspace lists and notes GraphQL cutover contract

## Scope and ownership

Personal lists and notes belong to the authenticated user and are independent
of the selected organization. `WorkspaceContentModule` owns their private
reads and note mutations. Public capability reads and share
enable/disable operations remain owned by `PublicSharingModule` and
`WorkspaceSharingModule`.

This checkpoint adds note create/update/delete while list writes remain on
REST. Shared-note updates and deletes write the domain change and the required
Socket.IO projection to the transactional cross-service outbox atomically.
The legacy socket host delivers those rows after commit.

| Legacy read | GraphQL query |
| --- | --- |
| `GET /api/lists` (retained adapter; no active routed page) | `workspaceLists(filter, page)` |
| `GET /api/canvas/lists` | repeated bounded `workspaceLists` pages |
| `GET /api/notes` | `workspaceNotes(filter, page)` |

| Legacy note write | GraphQL mutation |
| --- | --- |
| `POST /api/notes` | `createWorkspaceNote(input)` |
| `PUT /api/notes/:noteId` and the content/title/category variants | `updateWorkspaceNote(id, input)` |
| `DELETE /api/notes/:noteId` | `deleteWorkspaceNote(id, mutationId)` |

## Authentication and transport

- Both queries require the verified `itemize_auth` cookie.
- Resolvers derive `userId` only from verified request context.
- The active organization never changes the result.
- All note mutations require the verified cookie and CSRF header/token pair.
- `VITE_WORKSPACE_LIST_READS_GRAPHQL` controls both list surfaces.
- `VITE_WORKSPACE_NOTE_READS_GRAPHQL` independently controls note reads.
- `VITE_WORKSPACE_NOTE_MUTATIONS_GRAPHQL` independently controls all six
  existing note-write service methods.
- All three flags default to false. Selected GraphQL requests never retry through
  REST after a GraphQL failure.

The retained `UserHome` source uses the shared service adapter and correctly
handles the `{ lists, pagination }` REST envelope. The active `App` router no
longer mounts its legacy `/lists` route, so it is not a shipped browser
consumer. The current Canvas and Contents pages both use the canvas-list
adapter: `GET /api/canvas/lists` on REST or repeated bounded
`workspaceLists` pages on GraphQL.

## Query contract

Both queries return `nodes` plus the shared strict `PageInfo`. Page numbers are
one-indexed, page size is 1-100, and ordering is deterministic:
`updatedAt DESC, id DESC`.

`WorkspaceContentFilterInput` accepts:

- `search`, trimmed and limited to 200 characters;
- `categoryId`, a positive user-owned category ID.

List search matches titles. Note search matches title or content. A category
filter is resolved through the authenticated user's category rows and cannot
use another user's identifier.

The GraphQL types expose the private fields used by current consumers:
identity, title/content, category identity, typed list items, color, canvas
geometry, z-index, sharing state, and timestamps. The frontend adapter maps
camel-case GraphQL fields back to the existing REST-shaped objects.

## Category identity

Legacy list/note rows store both a category name and an incompletely populated
`category_id`. Reads resolve `categoryId` by joining the row's category name to
a category owned by the same user. They do not trust a foreign or stale stored
ID and return null when the name has no canonical category.

Note create/update/category mutations now accept the existing category-name
contract, resolve it case-insensitively to a category owned by the same user,
and write the canonical ID and name projection together. Legacy rollback reads
remain compatible with rows created through GraphQL. A create that resolves to
the default `General` category transactionally creates that canonical category
when a brand-new account has no category rows; concurrent creates converge on
the same row. Other unknown category names still fail closed.

Canvas `positionX` and `positionY` are finite non-negative GraphQL `Float`
values. Fractional coordinates are preserved through validation, PostgreSQL,
GraphQL responses, and retained REST reads. Width, height, and z-index retain
their integer contracts.

## Typed list items

List items are returned as `id`, `text`, and `completed`. Malformed historical
JSON entries are omitted rather than exposed as an invalid GraphQL value.
Mutation design must add bounded item count/text limits and concurrency
semantics before replacing whole-array REST writes.

## Mutation status

Note create/update/delete and the existing content/title/category variants are
implemented through the three GraphQL mutations above. Updates lock the note
row, so concurrent disjoint partial updates compose instead of overwriting one
another. Update/delete clients supply a UUID mutation ID that becomes part of
the stable outbox event key.

The following target mutations remain characterized but blocked:

- list create/update/delete, position/title changes, and item add/remove/toggle.

Before enabling the note write flag in a deployed environment:

1. the legacy realtime outbox worker must be enabled and its backlog/failed
   rows monitored;
2. event keys, at-least-once duplicate delivery, dead letters, and
   reconnect/refetch behavior must follow the realtime contract;
3. GraphQL and REST rollback paths must read each other's writes without
   repair;
4. a staging browser rehearsal must pass with the write flag enabled and then
   disabled.

List mutations additionally require atomic outbox adoption and explicit
list-item concurrent-edit semantics.

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

## Required cutover evidence

- Service tests for strict pagination/filter validation, mapping, malformed
  item handling, and safe dependency errors.
- Fresh PostgreSQL tests for user isolation, deterministic paging, category
  identity repair, title/content search, all three REST rollback reads, note
  create/update/delete, fractional geometry, default-category self-healing,
  CSRF, concurrent partial updates, and outbox delivery.
- Frontend tests for independent default-off flags, casing/envelope mapping,
  canvas multi-page reads, note mutation mapping, granular-update reuse, and
  REST-default selection.
- A staging browser rehearsal for the shipped Canvas and Contents pages with
  each read flag independently enabled and disabled, plus note writes with
  their mutation flag enabled and rolled back. **Passed on 2026-07-18.**
