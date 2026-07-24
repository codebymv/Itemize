# Landing pages GraphQL cutover contract

## Scope

The authenticated landing-page builder now uses `LandingPagesModule` directly for page CRUD, section CRUD/replacement/reordering, analytics, and the complete page-version lifecycle. The browser has no REST fallback for these operations.

The public rendering boundary remains HTTP:

- `GET /api/pages/public/page/:slug`
- `POST /api/pages/public/page/:slug/analytics`

Those endpoints are anonymous browser-navigation and telemetry protocols. Password assignment and verification remain a separate unfinished slice and are not implied complete by this contract. Version preview remains an HTTP iframe/document boundary even though authenticated version data and mutations use GraphQL.

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
- The retained Express version router omitted its passed organization middleware and could return false 404s; the GraphQL path derives organization exclusively from verified request context and repairs that unreachable authenticated surface.

## Compatibility boundary

`frontend/src/services/pagesApi.ts` and `pageVersionsApi.ts` remain the stable legacy-shaped TypeScript facades used by the page list, editor, and version-history dialog. Their authenticated functions delegate directly to `landingPagesGraphql.ts` and `landingPageVersionsGraphql.ts`, which map GraphQL camelCase fields back to the existing snake_case UI model. Only `getPublicPage`, `updatePublicPageAnalytics`, and iframe-oriented version preview use HTTP.

No landing-page rollout flag was added. This repository has no active customer data, the operations have clean-database parity coverage, and retaining an unused authenticated REST branch would weaken cutover evidence.

## Evidence gate

The slice is complete only when all of the following pass:

- NestJS build and landing-page/page-version service unit coverage.
- Frontend typecheck, targeted lint, and landing-page/page-version GraphQL mapping and transport tests.
- Disposable PostgreSQL integration coverage for REST/read parity, tenant isolation, CSRF, generated and explicit slugs, plan limits, page lifecycle, complete section lifecycle, exact-set reordering, zero-based ordering, analytics, duplication, version snapshot completeness, full publication, restoration, current-version protection, and delete concealment.
- Generated API surface and cutover ledger checks with all 18 authenticated operations at `consumer-cutover-complete`.
- Production schema canaries resolve the new query and mutation fields and reject anonymous access with `UNAUTHENTICATED`.
