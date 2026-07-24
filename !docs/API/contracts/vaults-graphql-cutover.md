# Vaults GraphQL cutover contract

**Status:** Shell lifecycle consumer cutover complete; item, lock-management, and sharing slices remain

## Shipped boundary

`VaultModule` owns authenticated user-scoped vault list, detail, create,
partial update, position update, and deletion. Canvas and Contents consumers
call GraphQL directly with no REST fallback. The six replaced Express routes
are no longer registered.

The detail query accepts an optional master password in the GraphQL request
body instead of an HTTP query string. A locked vault without a password returns
metadata, an empty item list, and `requiresUnlock: true`. A verified request
returns decrypted items. Neither password hashes nor encrypted values are part
of the GraphQL schema.

## Security and compatibility

- Ownership remains user-scoped because vaults are personal workspace content.
- Mutations are CSRF protected and foreign identifiers are concealed as
  `NOT_FOUND`.
- Master passwords require at least eight characters and at most 72 UTF-8
  bytes, then use bcrypt cost 12 as before.
- Stored values retain the existing AES-256-GCM format and production
  `VAULT_ENCRYPTION_KEY`.
- Decryption failure retains the authenticated owner UI's existing
  `[DECRYPTION_ERROR]` sentinel. Public sharing must fail closed instead.
- Pagination is bounded to 100 rows and ordering is deterministic.
- Position, dimensions, color, category, title, and search inputs are bounded
  before SQL execution.

Numbered migration `050_vault_storage` transactionally establishes both vault
tables, indexes, cascades, type constraint, and timestamp triggers. Production
startup requires that marker before route registration.

## Remaining slices

1. Atomic single and bulk item create/update/delete/reorder.
2. Lock, unlock, and password lifecycle mutations.
3. The explicit-consent vault-sharing model documented in
   `sharing-graphql-cutover.md`; its anonymous bearer-link read remains an HTTP
   protocol.

## Verification

Focused Nest tests cover pagination mapping, locked metadata, invalid-password
failure, bcrypt creation, partial position update, ownership, and delete
postconditions. Focused frontend tests cover legacy field mapping, CSRF, and
mutation input identities. The production migration stream contract and both
production builds also pass.
