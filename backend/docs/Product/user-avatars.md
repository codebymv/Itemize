# User avatars

User avatars are account-wide and internal to Itemize. Settings offers six free static sky presets or initials. New email and Google accounts receive a saved preset; existing accounts retain initials until they choose. Organization logos and public client documents remain separate.

## Shared conventions

Use `frontend/src/components/UserAvatar.tsx` for user identity in the shell, navigation, account settings, and organization members. Do not add local initials generators, external image-generator URLs, or theme-colored avatar backgrounds. Supply a nearby name or an accessible name on the containing control: the avatar itself is decorative. Missing, unknown, or failed artwork falls back to the shared initials helper.

The authoritative catalog is `backend/src/common/avatar-catalog.ts`. Authenticated `avatarCatalog` exposes it through GraphQL. `updateViewerAvatar` requires identity and CSRF, accepts an allowlisted stable key or explicit null, and always updates the requesting user. No organization plan affects selection. The Settings picker waits for confirmed persistence, prevents duplicate writes, and reports errors inline.

Artwork is local static SVG in `frontend/public/assets/avatars/`. Its fixed palette is illustration content; controls, borders, focus and selection use shared design tokens. Keep keys stable. Add artwork and its catalog entry together; the catalog test checks asset presence and prohibits executable or animated content. Do not reuse a retired key for different artwork.

Migration 082 (`user_avatar_v1`) adds nullable `users.avatar_key`, with no backfill. Session, current-user, organization-member and account-export projections include the selection. Deploy the migration and backend before the frontend because frontend GraphQL operations select the new field. The migration is additive and can remain if the application is rolled back.

## Verification

Coverage includes catalog assets, selection validation, initials and broken images, confirmed saves, duplicate clicks, failed-save retry, and a fresh PostgreSQL registration/login/CSRF/select/reset journey. Visual review covers the shared component at 32, 44 and 64 pixels in light and dark mode, plus the actual picker in a 340-pixel container.

Validated locally: 1,424 frontend tests, 996 backend tests, nine fresh PostgreSQL authentication lifecycle tests, GraphQL authorization/consumer contracts, both production builds, bundle budgets, and documentation synchronization. Frontend lint passes with existing warnings.

Photo uploads, paid presets, animation, milestones and public display are deferred.
