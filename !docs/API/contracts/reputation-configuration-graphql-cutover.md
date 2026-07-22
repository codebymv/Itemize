# Reputation configuration GraphQL cutover contract

**Status:** Implementation and dual-parity complete; production flags default off

**Evidence date:** 2026-07-22

## Decision

Authenticated review-platform, reputation-settings, and review-widget management move to `ReputationConfigurationModule`. The frontend uses three independent rollback boundaries: `VITE_REPUTATION_PLATFORMS_GRAPHQL`, `VITE_REPUTATION_SETTINGS_GRAPHQL`, and `VITE_REPUTATION_WIDGETS_GRAPHQL`.

The public widget-data capability remains credential-free, rate-limited HTTP. It is not a GraphQL operation and never accepts an authenticated organization selector. The public review submission capability also remains HTTP. Both can be revoked immediately and use `Cache-Control: no-store`.

## Platform contract

`reputationPlatforms`, `upsertReputationPlatform`, and `deleteReputationPlatform` require verified organization context; writes also require CSRF. Platform/type, names, identifiers, and HTTP(S) URLs are bounded. Upsert serializes `(organization, platform, place ID)` with an advisory transaction lock and uses `IS NOT DISTINCT FROM`, so a null place ID is one deterministic identity instead of an unlimited duplicate loophole.

The GraphQL type deliberately has no access-token, refresh-token, or token-expiry fields. Existing OAuth material therefore cannot leak through the new consumer even though the legacy REST projection historically selected those columns.

## Settings contract

`reputationSettings` returns a complete virtual default document without inserting a row. `updateReputationSettings` locks the organization singleton, composes partial changes onto existing state or the same defaults, validates all ranges/text/addresses/URLs, tenant-validates an optional email template, and writes the complete document atomically. A failed reference or validation leaves every prior setting unchanged.

## Widget management and public capability

`reputationWidgets`, `createReputationWidget`, `updateReputationWidget`, `deleteReputationWidget`, and `reputationWidgetEmbedCode` preserve the retained frontend shape. Names, display enums, `#RRGGBB` colors, border radius, rating, platform filters, review counts, refresh intervals, and activation are bounded. Create issues a random 128-bit hexadecimal capability key. Partial updates lock the row, foreign IDs are private misses, and deactivate/delete revokes public reads.

The prior embed response referenced `/widget/reviews.js`, but no such asset existed. The cutover adds the missing dependency-free browser runtime. Generated code separates the public asset origin from the API origin, renders all review content through `textContent`, sends no credentials, and fails closed to a small unavailable state.

The retained public endpoint accepts only exact 32-hex keys, returns only active widget configuration, clamps persisted limits, excludes hidden and flagged reviews, qualifies review selection by the capability owner's organization, and is the only API path allowed credential-free `Access-Control-Allow-Origin: *`. The rest of the application retains its authenticated CORS allowlist.

## Evidence and rollback

Fresh PostgreSQL coverage proves authorization and CSRF, null-place upsert serialization, OAuth-field schema omission, REST interoperability, tenant concealment, virtual settings defaults, tenant-qualified template validation with atomic rollback, complete widget create/update mapping, embed origins, hidden-review exclusion, input rejection without mutation, capability revocation, exact delete identity, and repeated private misses. Frontend adapter and dispatch tests prove all three flags are independently default-off, casing/input mapping, CSRF mutation routing, exact delete verification, embed/settings projections, retained REST rollback, and that platform routing cannot intercept review deletion. A focused CORS unit test freezes the single public wildcard boundary. The complete checkpoint passes 365/365 legacy unit cases, 341/341 focused Nest cases, 489/489 legacy PostgreSQL cases, 202/202 Nest PostgreSQL cases, and 328/328 frontend cases.

Rollback is data-neutral: set only the affected frontend flag to `false` and rebuild. The retained REST adapters use the same rows. Public widget retrieval and public review submission do not change transport during rollback.
