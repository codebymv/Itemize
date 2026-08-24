# Reputation analytics GraphQL cutover contract

**Status:** Permanent GraphQL cutover; authenticated REST retired

**Evidence date:** 2026-07-31

## Decision

The authenticated reputation analytics consumer is owned exclusively by the `reputationAnalytics` query in `AnalyticsModule`.

The query requires verified organization context and accepts an optional integer `days` window. The default is 30 and the accepted range is 1 through 365. The legacy route interpolated a parsed query value into interval text; GraphQL validates before SQL and binds the day count as a parameter.

## Snapshot semantics

Overall review counts, selected-period counts, rating distribution, platform distribution, the fixed 30-day UTC timeline, and selected-period request outcomes share one read-only repeatable-read transaction and one captured `asOf` boundary. Every table read is organization-qualified. Counts and averages are normalized to finite safe GraphQL numbers, platform ties use stable alphabetical ordering, and daily buckets use explicit UTC boundaries.

The projection preserves the retained frontend response shape through a casing adapter: overall totals and average, selected-period totals and average, rating/platform distributions, daily review counts, and request sent/clicked/converted counts. The active Reviews page consumes the overall block; the remaining fields stay available without forcing a second transport later.

## Evidence and permanent retirement

Fresh PostgreSQL proves exact retained overall parity, selected-period behavior, deterministic distributions, UTC bucketing, request outcomes, rejection of an out-of-range window, and exclusion of a foreign tenant's review and request. Repository tests prove all six metric groups share one snapshot and that both variable windows remain SQL parameters. Service tests prove numeric normalization; the frontend test proves period, selected-organization, casing, and complete retained-shape mapping.

Permanent retirement on 2026-07-31 removed the rollout variable, frontend REST branch, and Express analytics subrouter. Full route composition requires the former `GET /api/reputation/analytics` path to return `404`; permanent-dispatch coverage requires the consumer to call GraphQL without HTTP. Verification passed 347 frontend, 412 Express unit, 492 Nest unit/HTTP, 344 Express/PostgreSQL, and 269 Nest/PostgreSQL tests. Rollback requires redeploying the preceding application commit.

Production cutover completed from commit `4e9d63b4` with backend deployment `9723ae05-204f-493a-89f0-203c666f4e57`, GraphQL deployment `df732fda-7157-4a73-9c86-e3bcfa56dcb3`, and flag-enabled frontend deployment `c7fb43f1-2d5b-4f68-b473-fbe462ed87e9`. The public proxy accepted the complete selection and returned the intended anonymous auth guard. Railway confirmed `VITE_REPUTATION_ANALYTICS_GRAPHQL=true`; an authenticated `/reviews` reload rendered all five metric cards and the authoritative empty state while Nest recorded successful zero-error `ReputationReviews` and `ReputationAnalytics` operations.
