# Categories GraphQL cutover contract

## Scope and ownership

Personal workspace categories move to `CategoriesModule` in the NestJS
GraphQL service. They are owned by the authenticated user, not the selected
organization. A workspace switch must neither change the category list nor
grant access to another user's category identifiers.

The legacy routes remain available as the immediate rollback path until both
browser flags pass staging rehearsal.

| Legacy operation | GraphQL operation |
| --- | --- |
| `GET /api/categories` | `categories` |
| `POST /api/categories` | `createCategory(input)` |
| `PUT /api/categories/:id` | `updateCategory(id, input)` |
| `DELETE /api/categories/:id` | `deleteCategory(id)` |

## Authentication and transport

- Every operation requires the verified `itemize_auth` cookie.
- Mutations require the shared double-submit CSRF cookie/header contract.
- Resolvers derive `userId` only from verified request context.
- `VITE_CATEGORY_READS_GRAPHQL` controls the list query.
- `VITE_CATEGORY_MUTATIONS_GRAPHQL` independently controls all three writes.
- Both flags default to false. A selected GraphQL request never silently
  retries through REST after an error.

## Schema and validation

`Category` exposes `id`, `name`, `colorValue`, `createdAt`, and `updatedAt`.
The frontend adapter maps those fields back to the existing snake-case
consumer shape.

- IDs are positive GraphQL integers.
- Names are trimmed and contain 1-50 characters.
- Colors are 3- or 6-digit hexadecimal strings and are stored uppercase.
- Create defaults `colorValue` to `#3B82F6`.
- Update is partial, rejects explicit nulls, and requires at least one field.
- Exact duplicate names for one user return `DUPLICATE_CATEGORY_NAME`.
- Missing and foreign IDs use the same non-enumerating `NOT_FOUND` result.

The target does not copy the legacy read route's synthetic fallback rows.
Missing persistence is an operational error rather than invented user data.

## General invariant

Migration `category_contract_v1` backfills an exact `General` category for
every existing user and installs an `AFTER INSERT` user trigger so every new
account receives one with color `#6B7280`.

`General` may change color but cannot be renamed or deleted. This closes the
legacy state in which renaming it made every later delete fail. A missing
General row during deletion fails closed with `GENERAL_CATEGORY_MISSING`;
the source category and its content remain unchanged.

## Content propagation and transactions

Legacy workspace content primarily stores the category name. Only lists and
notes also have a partially populated `category_id`. The legacy category
delete updated those IDs without updating the names, and its updates were not
inside an explicit transaction.

The target treats the category row and content projection as one transaction:

- rename updates the category row plus matching list, note, whiteboard,
  wireframe, and vault category names;
- list and note `category_id` values are repaired to the renamed row;
- delete changes all five content stores to `General`, repairs list/note IDs,
  then deletes the source category;
- row locks serialize rename/delete against the selected category and the
  General destination.

An error in any content update rolls back the complete mutation.

## Required cutover evidence

- Service tests for mapping, normalization, partial updates, invariant
  outcomes, validation, and duplicate errors.
- Fresh PostgreSQL tests for new-user General seeding, user isolation, CSRF,
  duplicate behavior, five-store rename/delete propagation, and General
  protection.
- Frontend tests for independent default-off flags, casing/input mapping,
  mutation CSRF, and REST-default transport selection.
- An authenticated staging browser rehearsal that creates, recolors, renames,
  and deletes a category while list, note, whiteboard, wireframe, and vault
  cards are present. Disable the two flags to prove rollback before rollout.
