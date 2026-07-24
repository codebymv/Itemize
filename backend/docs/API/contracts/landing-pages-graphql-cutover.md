# Landing pages GraphQL cutover contract

## Scope

The authenticated landing-page builder now uses `LandingPagesModule` directly for page CRUD, section CRUD/replacement/reordering, analytics, password assignment/removal, and the complete page-version lifecycle. The browser has no REST fallback for these operations.

The public rendering boundary remains HTTP:

- `GET /api/pages/public/page/:slug`
- `POST /api/pages/public/page/:slug/analytics`

Those endpoints are anonymous browser-navigation and telemetry protocols. The page-delivery response itself performs any password check, so there is no separate public password oracle. Published `/p/:slug` pages render that retained public JSON contract inside an isolated document. Authenticated version preview reads the organization-qualified snapshot through `landingPageVersion`; there is no public numeric-ID preview endpoint.

## GraphQL operations

| Kind | Operation | Contract |
| --- | --- | --- |
| Query | `landingPages` | Organization-scoped bounded list; validated status/search; deterministic `updated_at DESC, id DESC`; exact pagination metadata |
| Query | `landingPage` | Organization-qualified complete page with ordered sections |
| Query | `landingPageAnalytics` | Organization-qualified 1-365 day aggregate for traffic, engagement, conversions, device, referrer, and UTM data |
| Mutation | `createLandingPage` | CSRF-protected transactional create with plan-limit serialization, bounded JSON, generated-slug allocation, and explicit-slug conflict |
| Mutation | `updateLandingPage` | Organization-qualified partial update, nullable clearing, vocabulary validation, and first-publication timestamp |
| Mutation | `deleteLandingPage` | Organization-qualified exact-identity delete |
| Mutation | `duplicateLandingPage` | Plan-limited transactional draft clone with copied sections and unique slug |
| Mutation | `replaceLandingPageSections` | Atomic complete replacement with contiguous zero-based order |
| Mutation | `addLandingPageSection` | Position-clamped row-locked insert |
| Mutation | `updateLandingPageSection` | Page- and organization-qualified bounded partial update |
| Mutation | `deleteLandingPageSection` | Transactional delete with order compaction |
| Mutation | `reorderLandingPageSections` | Exact-set row-locked reorder with contiguous zero-based order |
| Mutation | `setLandingPagePassword` | CSRF-protected organization-qualified bounded bcrypt update that preserves unrelated settings |
| Mutation | `removeLandingPagePassword` | CSRF-protected organization-qualified password-key removal that preserves unrelated settings |
| Query | `landingPageVersions` | Organization-qualified deterministic history with creator projection and the authoritative current-version pointer |
| Query | `landingPageVersion` | Organization-, page-, and version-qualified snapshot detail |
| Mutation | `createLandingPageVersion` | CSRF-protected complete page/section snapshot with page-row serialization and monotonic numbering |
| Mutation | `publishLandingPageVersion` | Atomic validated full-snapshot publication, ordered section replacement, publication timestamp, and current-pointer transition |
| Mutation | `deleteLandingPageVersion` | Row-locked exact-identity delete that rejects the current published version |
| Mutation | `restoreLandingPageVersion` | Actor-attributed clone as a new non-current version while preserving the documented restoration numbering gap |

## Security and consistency invariants

- Every operation requires verified cookie authentication.
- Every resolver derives organization and user identity from verified request context; client input cannot select an arbitrary owner.
- Mutations require the double-submit CSRF token.
- Foreign page and section identifiers are concealed as `NOT_FOUND`.
- Page limits are checked while the organization row is locked, preventing concurrent creates or duplicates from exceeding the limit.
- Generated slugs suffix conflicts deterministically; a conflicting explicit slug returns `CONFLICT`.
- Page and section JSON values must be objects and are bounded to 1 MiB each.
- Section types and page statuses use the database vocabulary.
- Section replacement and reordering are atomic. Reorder accepts only the exact current ID set, preventing missing, foreign, or injected sections from producing partial success.
- Section order is zero-based across create, add, delete, replace, duplicate, and reorder.
- Analytics periods are bounded and SQL interval input remains parameterized.
- Version reads qualify page ownership in SQL and conceal foreign page/version pairs as `NOT_FOUND`.
- Version creation locks the page before allocating the next number, preventing duplicate numbering under concurrent saves.
- Publication validates the stored JSON snapshot before mutation and restores all captured page fields plus ordered sections in one transaction. A conflicting historical slug returns `CONFLICT` without partial publication.
- `pages.current_version_id` is authoritative; `page_versions.is_current` is reconciled in the same transaction. The current version cannot be deleted.
- Restore records the verified current actor rather than copying stale authorship from the source snapshot.
- Password assignment accepts 4 or more characters but rejects values over bcrypt's 72-byte boundary instead of silently truncating them. The cost factor remains compatible with retained verification.
- Password writes patch only the `password` JSONB key, so concurrent or pre-existing page settings are not replaced by a stale read/modify/write object.
- Page and version GraphQL projections remove password hashes from generic settings/snapshot JSON and expose only `passwordProtected`; the server retains the hash for publication and public verification.
- Draft previews use the authenticated, organization-qualified `landingPageVersion` query. The former anonymous `/api/preview/version/:versionId` route was removed because enumerable IDs exposed unpublished page snapshots and the JSON response did not render in its iframe consumer.
- Published and draft content render through the same document builder. Custom HTML is sanitized, URL schemes are allowlisted, and custom script executes only in a sandboxed iframe without same-origin access to the authenticated application.
- Public password verification is part of the rate-limited page-delivery request. It supports bcrypt hashes and characterized legacy plaintext rows while all new assignments are hashed; the redundant standalone verification endpoint was removed.
- The retained Express version router omitted its passed organization middleware and could return false 404s; the GraphQL path derives organization exclusively from verified request context and repairs that unreachable authenticated surface.

## Compatibility boundary

`frontend/src/services/pagesApi.ts` and `pageVersionsApi.ts` remain the stable legacy-shaped TypeScript facades used by the page list, editor, and version-history dialog. Their authenticated functions—including password assignment/removal and version preview—delegate directly to `landingPagesGraphql.ts` and `landingPageVersionsGraphql.ts`, which map GraphQL camelCase fields back to the existing snake_case UI model. Only public page delivery and analytics use HTTP.

No landing-page rollout flag was added. This repository has no active customer data, the operations have clean-database parity coverage, and retaining an unused authenticated REST branch would weaken cutover evidence.

## Evidence gate

The slice is complete only when all of the following pass:

- NestJS build and landing-page/page-version service unit coverage.
- Frontend typecheck, targeted lint, and landing-page/page-version GraphQL mapping and transport tests.
- Disposable PostgreSQL integration coverage for REST/read parity, tenant isolation, CSRF, generated and explicit slugs, plan limits, page lifecycle, complete section lifecycle, exact-set reordering, zero-based ordering, analytics, duplication, password hashing/redaction/public verification/removal, version snapshot completeness, full publication, restoration, current-version protection, and delete concealment.
- Generated API surface and cutover ledger checks with all 20 authenticated operations at `consumer-cutover-complete`.
- Production schema canaries resolve the new query and mutation fields and reject anonymous access with `UNAUTHENTICATED`.
