# Vaults GraphQL cutover contract

**Status:** Authenticated consumer cutover and REST retirement complete; public capability read retained

## Shipped boundary

`VaultModule` owns authenticated user-scoped vault list, detail, create,
partial update, position update, and deletion. Canvas and Contents consumers
call GraphQL directly with no REST fallback. All replaced Express routes,
including the former standalone position-limiter registration, are no longer
registered.

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

## Item lifecycle

Single create, bounded bulk import, partial edit, deletion, and reorder use
CSRF-protected GraphQL mutations with no REST fallback. Every write locks the
owned parent vault, stores only AES-256-GCM authenticated ciphertext, updates
the parent timestamp, and commits atomically. Bulk import validates the complete
batch before writing instead of silently skipping malformed entries. Reorder
requires the exact authoritative item-ID set, and deletion compacts later
positions.

## Password lifecycle

Adding, rotating, and removing a master password use direct CSRF-protected
GraphQL mutations with no REST fallback. Each transition locks the owned vault
row before inspecting current state. Rotation requires the current password
when the vault is already locked; removal always requires it. Foreign IDs,
wrong passwords, already-unlocked removal, and inconsistent locked rows fail
closed with stable error reasons.

The frontend now prompts before reading a locked vault, retains successful
verification only for that mounted card session, and offers concise add,
change, and remove actions. Locked cards no longer render an empty vault as if
it contained no items. List projections distinguish an intentionally unloaded
item collection from a complete empty vault, repairing lazy loading for
non-empty vaults.

The password is an authenticated-owner read gate, not an encryption-derived
key. Stored item bytes continue to use the server-held `VAULT_ENCRYPTION_KEY`,
so password rotation/removal does not rewrite ciphertext. This preserves the
existing storage contract while avoiding a false client-side or zero-knowledge
encryption claim.

## Retained public boundary

The explicit-consent vault-sharing model documented in
`sharing-graphql-cutover.md` is implemented through authenticated GraphQL
mutations. Its anonymous bearer-link read remains an intentional HTTP protocol.

## Verification

Focused Nest tests cover pagination mapping, locked metadata, malformed-lock
denial, invalid-password failure, bcrypt creation/rotation, partial position
update, ownership, and delete postconditions. Fresh PostgreSQL covers the full
five-scenario vault lifecycle, including CSRF, foreign-ID concealment,
current-password rotation, old-password invalidation, ciphertext continuity,
removal, and already-unlocked denial. Focused frontend tests cover legacy field
mapping, CSRF, item mutations, and both password mutations. The production
migration stream contract and both production builds also pass.
