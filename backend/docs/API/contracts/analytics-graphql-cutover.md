# Analytics and dashboard GraphQL cutover contract

**Status:** Complete; all nine authenticated Analytics reads use GraphQL exclusively

**Evidence date:** 2026-07-27

## Decision

`AnalyticsModule` owns the complete authenticated dashboard and Analytics read surface. The frontend has no Analytics HTTP fallback, and Express no longer mounts `/api/analytics`.

| Retired HTTP behavior | GraphQL query |
| --- | --- |
| dashboard summary | `dashboardAnalytics` |
| contact buckets | `contactTrends` |
| closed-deal metrics | `dealPerformance` |
| booking totals | `bookingAnalytics` |
| real deal/form conversion | `conversionRates` |
| booked and collected revenue | `revenueTrends` |
| current open-deal age | `pipelineDealAge` |
| email/SMS delivery metrics | `communicationStats` |
| workflow enrollment outcomes | `workflowPerformance` |

Resolvers derive the organization from the canonical authenticated context. Organization identifiers are never trusted business arguments. Each query captures one database `asOf` inside a read-only repeatable-read transaction and applies it to every temporal predicate.

## Corrected business definitions

`conversionRates` excludes the former lead-to-customer metric because persisted contact status is operational, not a sales lifecycle. Deal conversion uses terminal deal outcomes and form conversion uses persisted submission `contactId`; deal values are separated by currency.

`revenueTrends` never adds deal value to payment value or different currencies. Booked revenue is won-deal value, collected revenue is successful paid-payment amount, and every bucket/summary is currency-specific. It is an operational bookings-and-collections projection, not GAAP revenue recognition.

`pipelineDealAge` reports current open-deal age from deal creation by configured stage. It does not claim time-in-stage velocity. Missing/foreign pipelines do not enumerate, open values are currency-specific, and the former guessed bottleneck label is removed.

## Shared rules and evidence

Family-specific enums fail before SQL. Counts and numerics are normalized safely. Every source and join is tenant-qualified. Each query uses one captured read-only repeatable-read snapshot, serial query execution, explicit UTC boundaries, deterministic pipeline selection, and zero-safe rates.

The dashboard shows real deal/form conversion, separate booked/collected currency series, and honestly named open-deal age. It has no Analytics REST branch.

Fresh PostgreSQL proves corrected definitions, tenancy, foreign-pipeline non-enumeration, snapshot behavior, strict input rejection, anonymous denial, and all nine retired `/api/analytics` paths returning 404. Unit and frontend coverage prove numeric/rate normalization, typed enum mapping, direct GraphQL transport, and build safety.
