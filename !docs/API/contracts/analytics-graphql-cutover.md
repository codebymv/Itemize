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

### Conversion

`conversionRates` deliberately excludes the former lead-to-customer metric because persisted contact status is operational (`active`, `inactive`, or `archived`), not a sales lifecycle.

- `dealWinRate` counts terminal deals whose `wonAt` or `lostAt` is inside the requested rolling window.
- Win rate is won divided by won plus lost.
- Won and lost deal values are returned separately for each normalized ISO currency.
- `formToContact` is submissions with a persisted `contactId` divided by all submissions in the window.
- Pipeline stage counts are not presented as conversions.

### Revenue

`revenueTrends` never adds deal value to payment value and never adds different currencies.

- Booked revenue is the value of deals won in the period.
- Collected revenue is the amount of successful payments paid in the period.
- Every bucket and summary is grouped by normalized ISO currency.
- Deal and payment counts, averages, cumulative values, and growth rates remain separate.
- Sparse UTC buckets are ordered ascending and share the captured `asOf`.

This is a bookings-and-collections operational projection, not GAAP revenue recognition. Refund, tax, discount, invoice-accrual, and FX policy require separately named future metrics.

### Pipeline deal age

`pipelineDealAge` reports the age of currently open deals from deal creation, grouped by current configured stage. It does not claim to measure time in stage or stage-transition velocity.

- The optional pipeline ID must be positive.
- Missing or foreign pipelines return the shared non-enumerating result.
- Default selection is deterministic: default pipeline, then creation time, then ID.
- `averageOpenDealAgeDays` is named for its actual source.
- Open values are separated by currency.
- Outcome summary reports average creation-to-win/loss duration and terminal win rate.
- The former hard-coded “bottleneck” label is removed; no unsupported domain judgment is inferred.

## Shared rules

Periods are family-specific GraphQL enums. Unsupported values fail before SQL with `BAD_USER_INPUT`. Counts are non-negative safe integers; money and averages are finite numeric scalars; percentages use zero-safe denominators. PostgreSQL numeric strings are normalized in the service layer.

Every base table, subquery, selected pipeline, and organization-owned join is tenant-qualified. Cross-organization data cannot affect totals, denominators, ordering, selected-pipeline behavior, or empty states. Database reads are serialized on the checked-out snapshot client.

Dashboard funnel stages come only from the deterministic selected pipeline and include configured zero-value stages. Upcoming bookings include future pending and confirmed rows only. Deal performance uses terminal timestamps. Communication milestones are cumulative for email and outbound-only for SMS delivery. Workflow totals use authoritative enrollment rows rather than advisory stats JSON.

UTC is explicit in results through `reportingTimezone`; organization-configurable reporting timezones remain a future enhancement rather than an implicit session-timezone behavior.

## Consumer contract

The dashboard displays:

- closed-deal and form conversion only;
- booked and collected revenue as distinct series for every currency;
- open-deal age, not “pipeline velocity”;
- no fabricated lead/customer count, combined revenue total, fake zero chart, guessed bottleneck, or mixed-currency dollar label.

Loading, empty, and error handling remains independently observable for each top-level query. GraphQL field names express their real domain meaning; misleading REST parity names were not carried forward.

## Verification gate

Fresh PostgreSQL coverage proves:

- own and foreign rows for every corrected source;
- default, requested, and foreign pipeline behavior;
- deal/form conversion denominators and currency-separated values;
- booked-versus-collected separation without double counting;
- open-deal age and creation-to-outcome summaries;
- strict enum/ID validation, anonymous denial, captured snapshot boundaries, and numeric normalization;
- all nine retired `/api/analytics` paths return 404.

Unit coverage proves snapshot rollback/release, one-boundary reuse, safe numeric conversion, rate calculations, currency normalization, typed frontend enum mapping, and direct GraphQL transport selection. The frontend and both backend builds must pass with the generated REST inventory and cutover ledger clean.
