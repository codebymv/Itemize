# Workspace lists and notes GraphQL cutover contract

## Scope and ownership

Personal lists and notes belong to the authenticated user and are independent
of the selected organization. `WorkspaceContentModule` owns their private
reads and eventual mutations. Public capability reads and share
enable/disable operations remain owned by `PublicSharingModule` and
`WorkspaceSharingModule`.

This checkpoint moves reads only. List and note writes currently publish
Socket.IO events to the owner's canvas and to active public-share viewers from
the legacy process. The transactional cross-service outbox is now implemented
and tested, but every mutation remains on REST until its repository writes the
domain change and all required audience rows atomically.

| Legacy read | GraphQL query |
| --- | --- |
| `GET /api/lists` | `workspaceLists(filter, page)` |
| `GET /api/canvas/lists` | repeated bounded `workspaceLists` pages |
| `GET /api/notes` | `workspaceNotes(filter, page)` |

## Authentication and transport

- Both queries require the verified `itemize_auth` cookie.
- Resolvers derive `userId` only from verified request context.
- The active organization never changes the result.
- `VITE_WORKSPACE_LIST_READS_GRAPHQL` controls both list surfaces.
- `VITE_WORKSPACE_NOTE_READS_GRAPHQL` independently controls note reads.
- Both flags default to false. Selected GraphQL requests never retry through
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

Mutation cutover must replace this compatibility read with a write invariant:
create/update/category mutations accept a category ID, lock or verify the
user-owned category, and write the ID and name projection together. Legacy
rollback writes must remain compatible with rows created through GraphQL.

## Typed list items

List items are returned as `id`, `text`, and `completed`. Malformed historical
JSON entries are omitted rather than exposed as an invalid GraphQL value.
Mutation design must add bounded item count/text limits and concurrency
semantics before replacing whole-array REST writes.

## Mutation blocker

The following target mutations are characterized but blocked:

- list create/update/delete, position/title changes, and item add/remove/toggle;
- note create/update/delete and content/title/category changes.

Before enabling any write flag:

1. mutations must enqueue owner and public-share Socket.IO projections through
   `RealtimeOutboxService` in the domain transaction;
2. realtime publication must occur only after a successful database commit;
3. event keys, at-least-once duplicate delivery, dead letters, and
   reconnect/refetch behavior must follow the realtime contract;
4. category ID/name writes must be atomic and user-scoped;
5. list-item concurrent edits must not silently overwrite one another;
6. GraphQL and REST rollback paths must read each other's writes without
   repair.

## Required cutover evidence

- Service tests for strict pagination/filter validation, mapping, malformed
  item handling, and safe dependency errors.
- Fresh PostgreSQL tests for user isolation, deterministic paging, category
  identity repair, title/content search, and all three REST rollback reads.
- Frontend tests for independent default-off flags, casing/envelope mapping,
  canvas multi-page reads, and REST-default selection.
- A staging browser rehearsal for the standalone list page and canvas with
  each read flag independently enabled and disabled.
