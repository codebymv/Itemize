# Tags GraphQL cutover

## Scope

`TagsModule` in the NestJS service is the only application transport for the
authenticated tag vocabulary:

- `tags` lists the selected organization's canonical tags and contact/deal
  usage counts;
- `contactTagSuggestions` exposes the same canonical vocabulary;
- `createTag` creates a canonical tag;
- `updateTag` renames or recolors a tag; and
- `deleteTag` removes a canonical tag.

The five authenticated Express operations formerly mounted under `/api/tags`
are removed. There is no frontend REST consumer or fallback for this surface.

## Canonical data model

The organization-scoped `tags` row and the `contact_tags` and `deal_tags`
junctions are authoritative. The legacy `contacts.tags` and `deals.tags`
arrays are compatibility projections maintained by database triggers; they are
not a second source of truth.

- Names are trimmed, bounded to 100 characters, and unique per organization
  after case-insensitive normalization.
- Creation and rename serialize on the organization and the database unique
  index remains the final concurrency authority.
- Renaming preserves the tag ID and updates contact and deal projections in
  the same database transaction.
- Deleting the tag cascades its memberships and removes the projected name
  atomically. A caller-controlled `removeFromContacts` mode is intentionally
  absent.
- Direct junction writes are organization-checked and refresh their
  compatibility projections.
- Campaign and segment compilers resolve membership through canonical tag IDs.

## Security and transport contract

- Every operation requires an authenticated selected-organization context.
- Foreign IDs are concealed as `NOT_FOUND`.
- All three mutations require CSRF protection.
- IDs must be positive integers; names and six-digit hexadecimal colors are
  validated before SQL.
- Duplicate names return `BAD_USER_INPUT` with
  `reason: DUPLICATE_TAG_NAME`.
- Lists and suggestions are stable under case-insensitive name ordering.

## Verification

- Fresh PostgreSQL GraphQL coverage proves list/count/suggestion mapping,
  tenant isolation, CRUD, CSRF, validation, foreign-ID concealment,
  repeat-delete behavior, and a single winner under concurrent
  case-insensitive creation.
- Canonical database coverage proves migration repair, stable IDs, trigger
  projections, cross-tenant membership rejection, deletion cleanup, normalized
  uniqueness, and campaign/segment membership visibility.
- Explicit retirement canaries prove all five former Tags HTTP operations
  return `404`.
- The generated API inventory contains no active Tags REST declaration and no
  frontend Tags REST consumer.
