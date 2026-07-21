# Analytics and dashboard GraphQL cutover contract

**Status:** Dashboard plus five dedicated metric queries implemented default-off; three business-definition queries remain blocked

**Evidence date:** 2026-07-21

## Decision

All nine authenticated `/api/analytics` reads move to `AnalyticsModule` GraphQL queries. They are organization-scoped projections, not generic reporting endpoints. Resolvers derive the organization from the canonical authenticated context; an organization ID is never accepted as an unverified business argument.

| Legacy behavior | GraphQL query |
| --- | --- |
| dashboard summary | `dashboardAnalytics` |
| contact buckets | `contactTrends` |
| closed-deal metrics | `dealPerformance` |
| booking totals | `bookingAnalytics` |
| lead/deal/form conversions | `conversionRates` |
| deal/payment revenue buckets | `revenueTrends` |
| pipeline deal age and outcomes | `pipelineVelocity` |
| email/SMS delivery metrics | `communicationStats` |
| workflow enrollment outcomes | `workflowPerformance` |

The target service captures one `asOf` timestamp and uses it for every boundary in one result. A dashboard snapshot must use one consistent database snapshot or a deliberately versioned materialized aggregate; independently timed queries are not an acceptable GraphQL batching contract.

## Inputs and scalar contract

Periods are typed enums, not arbitrary strings. Contacts accept `DAYS_7`, `DAYS_30`, `MONTHS_6`, and `MONTHS_12`; deals and revenue accept `DAYS_30`, `MONTHS_6`, and `MONTHS_12`; conversions accept `DAYS_7`, `DAYS_30`, `DAYS_90`, and `MONTHS_12`; communications accept `DAYS_7`, `DAYS_30`, and `DAYS_90`. Omission selects the documented default. Unsupported, repeated, malformed, or out-of-family values return `BAD_USER_INPUT`; they never run a different range while echoing the supplied label.

`pipelineVelocity` accepts an optional positive GraphQL ID. A malformed ID is bad input. A missing or foreign organization pipeline returns the shared non-enumerating result. Without an ID, selection is deterministic: default pipeline first, then `createdAt`, then ID.

Counts are non-negative integers, money and averages are finite numeric scalars, percentages are integer points from 0 through 100, and empty denominators return zero. PostgreSQL `COUNT`, `NUMERIC`, and `DECIMAL` strings are normalized in the service layer before reaching GraphQL. Dates are ISO instants or explicit local-date bucket keys; accidental JavaScript `Date` identity and locale formatting are forbidden.

## Tenant and query execution rules

Every base table, subquery, selected pipeline, and reference is constrained to the authenticated organization. Joins relying only on globally unique primary keys still include the organization condition where the joined table owns one, so the invariant survives future partitioning, imports, and composite-key changes. Cross-organization data must not affect totals, denominators, ordering, the selected pipeline, recent rows, or empty/non-empty behavior.

The legacy handlers previously started multiple `client.query` calls concurrently on one checked-out `pg` client. `pg` currently queues that pattern but deprecates it for version 9. The characterized implementation serializes those calls. NestJS may deliberately parallelize independent reads only with separate pool leases and a bounded fan-out policy; consuming a connection per dashboard field is not acceptable. Query count, duration, rows scanned, and timeout/cancellation must be observable per operation without logging contact content or message bodies.

## Characterized metrics

Dashboard contact, deal, task, pipeline, invoice, signature, workspace, and booking totals use the authenticated organization. Recent activity is newest-first and bounded to ten; other recent projections are bounded to five. The dashboard funnel represents only the deterministic default/earliest pipeline, including configured stages with zero open deals. It does not merge stage identifiers from multiple pipelines.

Upcoming booking counts and `bookingAnalytics.upcoming` include future `PENDING` and `CONFIRMED` bookings only. Cancelled, completed, and no-show rows remain in their status totals but are not actionable upcoming work. Booking completion rate is completed divided by completed plus no-show; cancelled and future bookings are not in that denominator.

Deal performance includes rows whose `wonAt` or `lostAt` falls inside the rolling window. Win rate is won divided by won plus lost. Average value and close duration use won deals only. Open deals do not enter closed metrics.

Communication totals use the queued timestamp window. Email milestones are cumulative state semantics: `CLICKED` is also opened, delivered, and sent; `OPENED` is delivered and sent; `DELIVERED` is sent. Delivery rate uses total queued rows as the current denominator, open rate uses delivered, and click rate uses opened. SMS `DELIVERED` is also sent; SMS delivery rate uses outbound rows. Provider callbacks and retries must remain idempotent or analytics will count transport duplicates.

Workflow performance groups enrollments by organization-owned workflow and current status. Per-workflow and overall completion rates use total enrollment rows and return zero for empty workflows. The stored `stats` JSON is advisory; enrollment rows are the characterized source for these projections.

## Revenue buckets and blocked definition

The implementation now canonicalizes bucket instants before merging deal and payment rows, so one calendar bucket appears once and carries both `dealsWon` and `paymentsCount`. Ordering is ascending, cumulative revenue follows that order, and tenant isolation applies independently to both sources. Sparse buckets are current parity: periods with no events are omitted.

The business definition is not approved for cutover. Current `revenue` adds the full value of won deals to succeeded payments. If a payment settles an invoice for the same sale, the sale can be counted twice. `avgDealValue` then divides that mixed total by deal count plus payment count, so its name and denominator are misleading. Before resolver implementation, product and finance owners must choose one of these contracts:

- recognized revenue from successful, net-of-refund payments only;
- booked sales from won deals only;
- separately named `bookedRevenue` and `collectedRevenue`, with no combined total.

Currency is also absent from aggregation. Mixing USD and non-USD numeric values is forbidden in the target. The schema must either group by currency, require one organization reporting currency with an auditable FX policy, or reject mixed-currency aggregation. Refunds, partial payments, payment reversals, invoice status, tax, discounts, and recognition date each need an explicit rule. Until those decisions and fixtures exist, `revenueTrends` remains blocked despite transport characterization.

## Known semantic gaps

Persisted contact status is `active`, `inactive`, or `archived`, while the legacy dashboard and conversion SQL ask for `lead` and `customer`. Those fields therefore report zero on the current fresh schema. Validators elsewhere still mention a different set. The target must not disguise this contradiction by mapping `active` to a sales lifecycle. Define a separate lifecycle field/migration or remove the lead/customer metrics; `conversionRates.leadToCustomer` is blocked until then.

`pipelineVelocity` does not measure time in stage. No transition history is queried; `avgAgeDays` is the age of currently open deals from deal creation, grouped by their present stage. It must be renamed to `averageOpenDealAgeDays`, or a stage-transition event model must be introduced before exposing true stage velocity. The hard-coded bottleneck rule of more than 14 days and more than two deals is a UI heuristic, not a domain invariant, and should become a named configuration or remain client-side.

The implemented dashboard and contact-trend buckets use explicit UTC and captured inclusive-start/exclusive-end boundaries rather than the PostgreSQL session timezone. Organization-configurable reporting timezone, stable local-date bucket keys, and DST fixtures remain production gates; the blocked revenue query must not reuse its legacy session-timezone `DATE_TRUNC` behavior.

The dashboard invoice “pending” projection now means sent, viewed, or partial; signature “awaiting” means sent or in progress. These are presentation groups, not persisted statuses, and target enum names must make that distinction visible. Contact `active`, new-this-month/week rolling windows, paid-this-month calendar windows, and signed-this-week calendar windows must not be presented as though they share one boundary convention.

## GraphQL shape and loading

`dashboardAnalytics` is an intentional coarse snapshot for the current dashboard. The dedicated queries remain available for period controls and detailed widgets. The React page currently fires dashboard, conversion, communication, pipeline, and revenue requests in parallel; migration should use one composed GraphQL document only where latency and authorization remain observable per top-level field. DataLoader is for repeated entity lookup, not aggregate-query deduplication.

The target schema must avoid ambiguous or misleading names. In particular, do not preserve `wonValue` for a deal-plus-payment total, `avgDealValue` for mixed events, or `velocity` for deal age. New fields may coexist with deprecated parity fields during migration, but dashboards switch only after comparison telemetry shows accepted differences.

### Dashboard implementation checkpoint

`AnalyticsModule.dashboardAnalytics` now captures one database `asOf` and runs every aggregate read serially inside one read-only, repeatable-read transaction. Every temporal predicate receives that captured value instead of evaluating `NOW()` independently. Calendar month/week projections are explicitly UTC for this checkpoint and the result reports `reportingTimezone: "UTC"`; organization-configurable reporting timezone remains a production gate rather than an implicit session setting.

The schema uses finite numeric scalars and rejects unsafe counts before serialization. Default/earliest-pipeline selection, configured zero-value stages, recent-row bounds, actionable future bookings, tenant-qualified activity joins, and every organization-owned base table match the characterized contract. `bookedValue`, `bookedThisMonth`, `collectedValue`, and `collectedThisMonth` expose the two revenue sources separately. The legacy mixed `wonValue` and `wonThisMonth`, plus the nonexistent contact `leads`/`customers` lifecycle projections, remain only as GraphQL-deprecated parity fields so the current React consumer can switch transports without silently inventing business meaning.

The frontend adapter is independently controlled by default-off `VITE_DASHBOARD_ANALYTICS_GRAPHQL`. Five additional independent default-off flags select `contactTrends`, `dealPerformance`, `bookingAnalytics`, `communicationStats`, and `workflowPerformance`; conversion, revenue trends, and pipeline velocity remain on REST. PostgreSQL mounts both implementations, compares the unchanged retained fields, and proves the deliberately stricter outbound-SMS and workflow-contact tenancy rules. Focused tests cover transaction rollback, one-boundary reuse, numeric overflow, funnel zero stages, typed enum mapping, independent transport selection, and REST-default rollback. No deployment configuration is enabled by this checkpoint.

### Dedicated analytics implementation checkpoint

Each implemented dedicated query captures database `asOf` inside its own read-only repeatable-read transaction and applies that value to every temporal predicate. Contact periods produce sparse UTC buckets; deal metrics use closed-state timestamps; booking completion uses completed plus no-show outcomes; communication reads are serialized and use cumulative email milestones with outbound-only SMS delivery semantics; workflow totals qualify both the workflow and enrolled contact to the authenticated organization and use enrollment rows rather than advisory `stats` JSON.

The GraphQL schema accepts only family-specific enums and rejects an unsupported variable before resolver SQL. Counts and monetary/average values are normalized before serialization, zero denominators are explicit, and every query retains the current frontend response shape while adding `asOf` (and `reportingTimezone` for contact buckets). The independent flags are `VITE_CONTACT_TRENDS_GRAPHQL`, `VITE_DEAL_PERFORMANCE_GRAPHQL`, `VITE_BOOKING_ANALYTICS_GRAPHQL`, `VITE_COMMUNICATION_STATS_GRAPHQL`, and `VITE_WORKFLOW_PERFORMANCE_GRAPHQL`.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Tenancy | own and foreign rows for every source; foreign selected pipeline; cross-tenant joins and empty-state non-enumeration |
| Inputs | each supported period/default; wrong-family, repeated, malformed, huge, zero, negative, and foreign pipeline IDs |
| Time | exact lower boundary; just outside; captured `asOf`; month/year rollover; timezone and DST transitions |
| Numeric | PostgreSQL strings normalized; decimals; zero denominators; rounding; large safe counts; GraphQL scalar overflow |
| Buckets | deal/payment same bucket; source-only buckets; sparse gaps; ascending order; cumulative sum; stable key serialization |
| Dashboard | default and fallback pipeline; duplicate stage IDs across pipelines; zero stages; terminal future bookings; recent-row bounds |
| Communications | queued/sent/delivered/opened/clicked/bounced/failed; inbound SMS denominator; callback replay |
| Workflows | no enrollment, every status, stored-stats disagreement, deleted contact references, tenant isolation |
| Failure | timeout, cancellation, one subquery failure, pool exhaustion, consistent snapshot, no partial misleading result |
| Consumer | loading/error/empty/partial states, period switching, timezone labels, currency display, deprecated-field removal |

## Current evidence and exit gate

Fresh PostgreSQL coverage proves strict period rejection, positive pipeline-ID validation, requested contact windows, tenant isolation, same-bucket revenue merging, selected-pipeline funnel behavior, exclusion of terminal future bookings, numeric dashboard fields, cumulative communication milestones, outbound-only SMS metrics, cross-tenant workflow-contact exclusion, foreign-pipeline non-enumeration, and zero-safe deal and booking metrics. The NestJS comparisons additionally prove typed tenant-isolated snapshots, retained-field REST parity for unchanged contracts, explicit revenue components, default-organization selection, and unauthenticated denial against a database built from zero. Unit coverage proves read-only repeatable-read transactions, captured-boundary reuse, rollback/release after subquery failure, PostgreSQL numeric normalization, GraphQL-safe count rejection, configured zero-value funnel stages, typed period mapping, rate denominators, and enrollment-derived workflow summaries.

All six implemented queries remain default-off until comparison telemetry, query budgets/cancellation, an organization reporting-timezone decision, and migration of the React dashboard labels away from deprecated mixed/lifecycle fields are rehearsed. Revenue trends, conversion rates, and pipeline velocity remain blocked on their documented business definitions; they are not safe candidates for mechanical resolver parity.
