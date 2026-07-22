# Reputation analytics GraphQL cutover contract

**Status:** Production consumer cutover complete behind `VITE_REPUTATION_ANALYTICS_GRAPHQL`

**Evidence date:** 2026-07-21

## Decision

The authenticated `GET /api/reputation/analytics` consumer moves to the `reputationAnalytics` query in `AnalyticsModule`. Review CRUD remains independently controlled by `VITE_REPUTATION_REVIEWS_GRAPHQL`; platform connections, request delivery, widgets, settings, and public collection remain separate slices.

The query requires verified organization context and accepts an optional integer `days` window. The default is 30 and the accepted range is 1 through 365. The legacy route interpolated a parsed query value into interval text; GraphQL validates before SQL and binds the day count as a parameter.

## Snapshot semantics

Overall review counts, selected-period counts, rating distribution, platform distribution, the fixed 30-day UTC timeline, and selected-period request outcomes share one read-only repeatable-read transaction and one captured `asOf` boundary. Every table read is organization-qualified. Counts and averages are normalized to finite safe GraphQL numbers, platform ties use stable alphabetical ordering, and daily buckets use explicit UTC boundaries.

The projection preserves the retained frontend response shape through a casing adapter: overall totals and average, selected-period totals and average, rating/platform distributions, daily review counts, and request sent/clicked/converted counts. The active Reviews page consumes the overall block; the remaining fields stay available without forcing a second transport later.

## Evidence and rollback

Fresh PostgreSQL proves exact retained overall parity, selected-period behavior, deterministic distributions, UTC bucketing, request outcomes, rejection of an out-of-range window, and exclusion of a foreign tenant's review and request. Repository tests prove all six metric groups share one snapshot and that both variable windows remain SQL parameters. Service tests prove numeric normalization; the frontend test proves period, selected-organization, casing, and complete retained-shape mapping.

The flag is default-off in source. Setting only `VITE_REPUTATION_ANALYTICS_GRAPHQL=false` and rebuilding restores the retained REST read against the same rows without affecting GraphQL review CRUD.

Production cutover completed from commit `4e9d63b4` with backend deployment `9723ae05-204f-493a-89f0-203c666f4e57`, GraphQL deployment `df732fda-7157-4a73-9c86-e3bcfa56dcb3`, and flag-enabled frontend deployment `c7fb43f1-2d5b-4f68-b473-fbe462ed87e9`. The public proxy accepted the complete selection and returned the intended anonymous auth guard. Railway confirmed `VITE_REPUTATION_ANALYTICS_GRAPHQL=true`; an authenticated `/reviews` reload rendered all five metric cards and the authoritative empty state while Nest recorded successful zero-error `ReputationReviews` and `ReputationAnalytics` operations.
