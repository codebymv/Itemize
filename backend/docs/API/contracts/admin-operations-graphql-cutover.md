# Admin operations GraphQL cutover contract

**Status:** Implementation and dual-transport parity verified; production consumer cutover pending

**Evidence date:** 2026-07-22

## Decision

The global administrator directory, system statistics, and current-administrator plan mutation move to `AdminOperationsModule`. Directory/statistics reads use `VITE_ADMIN_DIRECTORY_GRAPHQL`; the plan mutation has the independent `VITE_ADMIN_PLAN_GRAPHQL` rollback boundary. Admin email templates, logs, previews, and delivery remain separate messaging slices.

These operations are intentionally not organization-scoped. `AdminAccessGuard` reads the authenticated user's current role from PostgreSQL for every operation and accepts only `ADMIN`; a stale token cannot retain administrative access after a database role change.

## Directory and statistics contract

`adminUserCount` and `adminSystemStats` return global counts. `adminUsers` validates a trimmed 255-character search, page, limit of at most 100, and the supported plan set. Results use a deterministic creation-time/ID order, obtain rows and total under one repeatable-read snapshot, and preserve the legacy free-plan fallback. `adminUserIds` uses the exact same search and plan predicates so “select all filtered” cannot include users hidden by the visible plan filter. The retained REST fallback now has the same repair.

`adminUsersByIds` accepts at most 100 positive integer IDs, deduplicates them, and preserves first-requested order. All directory projections are admin-only and intentionally exclude authentication, token, and billing-secret fields.

## Plan mutation contract

`updateAdminOwnPlan` is CSRF-protected and accepts only `free`, `starter`, `unlimited`, or `pro`. It locks the administrator row, resolves the default organization and an active plan, upserts its subscription, and updates `organizations.current_plan_id` in one transaction. A missing organization, unavailable plan, vanished organization, or failed write leaves both plan authorities unchanged.

## Evidence and rollback

Fresh PostgreSQL coverage proves anonymous and non-admin denial without organization context, authoritative global counts, stable filtered search, plan-filtered ID parity, ordered/deduplicated batch lookup, validation bounds, CSRF, successful two-authority plan storage, and failed-mutation rollback. Focused unit and frontend tests freeze normalization, pagination, filtered selection, REST fallback, independent flags, and CSRF mutation transport.

The complete checkpoint passes 365 legacy unit tests, 345 Nest unit tests, 489 legacy PostgreSQL integration tests, 206 Nest PostgreSQL integration tests, and 333 frontend tests. Both frontend flags default off. Rollback is data-neutral: disable only the affected flag and rebuild; both transports share the same PostgreSQL rows.
