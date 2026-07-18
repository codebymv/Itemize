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
| `GET /api/lists` | `workspaceLists(filter, page)` |
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

The standalone list page now uses the shared service adapter. The legacy page
previously treated `GET /api/lists` as a bare array even though the route
returns `{ lists, pagination }`.

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
remain compatible with rows created through GraphQL.

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

## Required cutover evidence

- Service tests for strict pagination/filter validation, mapping, malformed
  item handling, and safe dependency errors.
- Fresh PostgreSQL tests for user isolation, deterministic paging, category
  identity repair, title/content search, all three REST rollback reads, note
  create/update/delete, CSRF, concurrent partial updates, and outbox delivery.
- Frontend tests for independent default-off flags, casing/envelope mapping,
  canvas multi-page reads, note mutation mapping, granular-update reuse, and
  REST-default selection.
- A staging browser rehearsal for the standalone list page and canvas with
  each read flag independently enabled and disabled, plus note writes with
  their mutation flag enabled and rolled back.
