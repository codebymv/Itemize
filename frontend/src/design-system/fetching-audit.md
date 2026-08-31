# Fetching audit

This audit treats an HTTP request as an implementation detail and a read model
as the user-facing boundary. GraphQL already gives Itemize one transport
endpoint; the goal is one named operation for each coherent screen lifecycle,
not one resolver request per card and not one universal payload for the entire
application.

## Measured baseline

Authenticated cold loads were measured in the browser against the deployed
GraphQL API before the first consolidation pass.

| Route | GraphQL requests |
| --- | ---: |
| Dashboard | 17 |
| Inbox | 15 |
| Pipelines | 13 |
| Contacts | 12 |
| Invoices | 12 |
| Calendars | 12 |
| Campaigns | 10 |
| Reputation | 7 |

Seven requests were effectively shell-owned. Several of those reads repeated
on every private pathname change because authentication and onboarding effects
were coupled to the literal pathname and React Query forced every mounted query
to refetch regardless of freshness.

The old dashboard added five route-owned requests in two waves. Summary and
revenue loaded first; conversions, communications, and deal age waited for the
summary to decide whether the workspace had activity. That was both request
fan-out and a waterfall.

## Current result

Dashboard summary, conversions, communications, deal age, and revenue now load
through the single `DashboardSnapshot` operation. A cold dashboard load dropped
from 17 to 11 GraphQL requests. During same-session private navigation:

- Contacts, invoices, campaigns, and calendars issue one route operation each.
- Pipelines issues one `PipelineWorkspace` operation on a supporting schema.
  The server selects the requested, default, or first pipeline and hydrates
  only that board; stacked boards remain explicit lazy reads.
- Returning to a still-fresh dashboard issues no GraphQL request.
- Viewer, onboarding, billing, get-started, and notification reads no longer
  accompany every route transition.

The selected-organization shell now loads billing status, onboarding progress,
and get-started progress through one shared `OrganizationBootstrap` cache entry.
On a schema that supports the combined operation this replaces three cold reads
with one, projecting the measured cold dashboard budget from 11 to 9 requests.
If a rolling deployment rejects the aggregate operation, the client remembers
that capability and uses three parallel compatibility reads without repeatedly
probing the unsupported shape.

Entitlement fetch failure is no longer interpreted as a Free plan. The shell
shows a retryable access-verification failure so a 429, network interruption, or
temporary API failure cannot create a false upgrade wall.

Pipeline navigation and the primary board now share one route read model. A
rolling deployment that does not yet expose `pipelineWorkspace` falls back to
the former list-then-board flow and remembers the negotiated schema capability,
so the validation failure is not repeated. This changes the supported warm
pipeline route budget from two route reads to one without loading every
pipeline's deals.

Inbox list and detail compatibility shapes are now static, schema-auditable
operations with process-local capability memory. An older conversation schema
may require negotiation once, but subsequent reads use the successful provider
field and channel-filter shape directly instead of replaying expected failures.

Invoice and estimate editors now each own one cancellable bootstrap query. The
invoice bootstrap returns the document, recent contact choices, a bounded
business page, and invoice settings in one client operation. Products are an
explicitly lazy, server-searched picker rather than bootstrap payload. The
estimate bootstrap returns its document and recent contacts and can include a
URL-selected contact that is outside that page. The legacy `products` schema
field remains selection-aware: current operations omit it, so its repository
read does not run. Older deployments negotiate the former parallel reads once,
retain that capability for the session, and use one bounded business read
instead of walking every page.

Contact detail now loads the authoritative contact, its bounded activity
timeline, and the four rendered related-content previews through one
organization-scoped `ContactDetailBootstrap` operation. The route owns one
cancellable React Query cache entry instead of an imperative three-request
`Promise.all`; adding a note patches that cache directly, while contact edits,
email sends, and deletion invalidate only the affected contact or list views.
The broader server-side `contactProfile` aggregate remains reserved for a UI
that renders its invoices, signatures, payments, communications, tasks, and
bookings, avoiding six unused database reads on the current detail page.

Campaign create and detail now share one cancellable
`CampaignEditorBootstrap` read model. It returns the optional campaign, complete
template and segment catalogs, filter options, and an audience preview only for
editable draft or scheduled campaigns. The server owns catalog pagination, and
the client remembers whether a rolling deployment supports the aggregate before
using its parallel compatibility path. Recipient delivery remains a distinct,
cancellable query because it is independently paginated, status-filtered, and
allowed to fail without taking campaign performance or editing offline.

Recurring invoices now enter through one cancellable schedule-list query.
Contacts are fetched only when creation opens, the unused eager product catalog
has been removed, and expanding a schedule uses one
`RecurringInvoicePreviewBootstrap` operation for the full schedule, advisory
invoice number, and preview business. The client remembers rolling-schema
capability before using its parallel compatibility path; that path uses one
bounded business read and never follows pagination. Create, pause, resume,
generate, and delete update the organization-scoped caches directly.
Generation invalidates the expanded preview and dashboard snapshot because
they own the derived invoice number, schedule detail, and financial summary
data.

Signature document and template editors now each own one cancellable,
organization-scoped aggregate query. Those server operations already return
the complete editor bootstrap (`document + recipients + fields + audit` or
`template + roles + fields`), so the client no longer rebuilds route state with
imperative effects. Save and file mutations patch the authoritative aggregate
cache directly; reminder, retry, and cancellation responses update immediately
and refresh operational audit data in the background instead of blocking on a
full reload. Reliability-field compatibility is negotiated once per document
or template schema family and remembered for the browser session. Invoice PDF
prefill remains a deliberate lazy two-resource workflow because it is used only
when an invoice explicitly launches a new signature request and includes a
binary stream that does not belong in the editor's GraphQL detail aggregate.

The integrations route now owns one cancellable `IntegrationOverview` query
for calendar accounts, active Facebook connection identity, and Stripe
connection state. The server keeps calendar status critical while preserving
explicit availability flags for the two auxiliary status providers, so a read
failure is rendered as unavailable instead of the misleading disconnected
state used by the former caught promises. Disconnect mutations patch this
organization-scoped source of truth directly. OAuth initiation and live Google
calendar discovery remain lazy HTTP capabilities because they redirect to or
perform I/O with an external provider. Rolling deployments negotiate the
former three-query read once and remember that capability for the session.

Reputation configuration now owns one cancellable
`ReputationConfigurationBootstrap` query for review platforms and the shared
automation/alert settings edited by that route. Platform and settings mutations
patch the same organization-scoped cache directly. Reviews, review requests,
and review widgets remain separate lifecycles because they are independently
paginated, operated, or editor-scoped. Rolling deployments negotiate the former
two-query configuration read once and remember that capability for the session.

The reviews route now keeps its 30-day analytics and rating-filtered collection
in separate cancellable caches. Changing a collection filter no longer reloads
unchanged analytics, and either section can retain useful data if the other
fails. Review requests use their own status-filtered cancellable cache; deletes
patch any affected cached page, while sends and resends narrowly refresh that
collection because delivery state can continue changing. Review-widget
collections use one shared organization-scoped cache.
Existing widget editors request only the selected widget, preview samples remain
an optional independent read, and installation code is fetched only when the
Install mode is opened. Saves patch the detail and collection caches rather than
blocking on a route reload. A rolling deployment negotiates the former widget-
list lookup once and remembers that compatibility mode for the browser session.

Workspace Canvas, Contents, and Shared now consume one user-scoped, cancellable
`WorkspaceContentSnapshot` operation composed from the five existing paginated
root fields. This removes the lists/notes/whiteboards/wireframes/vaults request
storm without inventing a second server aggregation layer. Both routes share
one fresh cache entry, and their create, edit, sharing, and delete handlers patch
that source of truth through the existing setter contract. A failed background
refresh keeps the last complete snapshot visible. The initial snapshot remains
bounded to 50 rows per type and exposes each type's total/continuation state;
editor-only detail and vault unlock data remain lazy.

Global search now waits for a two-character debounced query and owns at most
two cancellable reads: one reusable workspace snapshot and one bounded
`OrganizationGlobalSearch` operation. The organization operation searches
segments, campaigns, and workflows immediately, adds contacts, invoices, and
signature documents only from three characters onward, and returns at most
three rows per module. This replaces the former eleven-request, two-wave fanout;
closing the dialog or changing the query aborts both obsolete reads.

Email and SMS template lists now each own bounded, organization-scoped,
cancellable page caches. Search, category, and publication status are
server-owned query dimensions, while global summary counts and categories are
returned alongside the page. The email editor's template browser incrementally
loads the same catalog family instead of maintaining an orphaned loader.
Duplicate, delete, draft, publish, and save mutations invalidate only the
authoritative catalog family.

Segments follow the same bounded-catalog rule: list search and availability are
local projections of one cancellable organization cache. Recalculation,
deletion, and editor saves patch that catalog immediately. Segment editors use
one cancellable `SegmentEditorBootstrap` operation for the selected definition
and its matching-rule vocabulary instead of an imperative two-request
`Promise.all`. Segment mutations narrowly mark campaign-editor bootstraps stale
because those editors carry a derived copy of the selectable segment catalog.

Reusable signature templates now use one cancellable organization-scoped
catalog cache with local search and readiness projections. Expanded PDF/field
previews and the full template editor share one detail key, so opening the same
template in either surface reuses fresh roles and field placement data. Create,
delete, settings, and PDF-upload mutations patch or remove the appropriate
catalog/detail entries. Signature documents remain a separate paginated
operational queue; they must not be mislabeled as a bounded template catalog.

The current dashboard operation composes existing root fields. It removes HTTP
fan-out immediately, but it is not a database-atomic snapshot and any GraphQL
error currently shares the dashboard's route-level error boundary. A future
server-owned `dashboardSnapshot` field is justified if Itemize needs a shared
`asOf` transaction, resolver batching, payload-specific authorization, or
partial-section error metadata.

## Request budget

Use these ownership budgets when reviewing a route:

| Navigation | Budget |
| --- | --- |
| Cold authenticated entry | Session bootstrap + organization bootstrap + notification query + one critical route operation |
| Warm private route change | Zero shell reads + one critical route operation |
| Detail-dependent route | One route operation + explicitly documented lazy detail reads |
| Returning to fresh cached route | Zero reads |
| Compatibility support resource | One bounded read; never an implicit all-page loop |
| Off-page selected support record | One bounded page + at most one direct record lookup |

A visually separate card is not a separate fetch lifecycle. Separate a query
only when it is independently paginated, live, lazy, permissioned, mutated, or
allowed to fail without failing the rest of the route.

## Priority migration queue

1. **Session bootstrap:** evaluate combining viewer and organization membership
   after defining how an account with no membership receives its default
   organization. The selected-organization bootstrap is complete; billing usage
   and plans remain separate because they have settings-specific refresh needs.
2. **Dense editors and details:** invoice/estimate editor, contact-detail,
   campaign-editor, recurring-invoice preview, and both signature-editor
   bootstraps, calendar integration overview, and reputation configuration are
   complete.
3. **Workspace contents:** complete. The two workspace collection routes share
   one bounded, paginated snapshot operation; editor and unlock detail remains
   lazy.
4. **Imperative page reads:** migrate route-owned `useEffect` fetching to shared,
   organization-scoped query ownership so cancellation, freshness, deduplication,
   and invalidation behave consistently.

## Enforcement checklist

- Query keys include organization and every server-side filter.
- The transport receives the query's `AbortSignal`.
- Permanent 4xx reads do not retry. A 429 is manual-retry-only until the
  transport preserves `Retry-After`; 408 and transient failures may retry within
  the shared limit. GraphQL `NOT_FOUND`, `BAD_USER_INPUT`, `FORBIDDEN`, and
  `UNAUTHENTICATED` codes remain permanent even when the HTTP envelope is 200.
- Mutations do not retry unless the server enforces a stable idempotency key.
- Polling pauses in hidden documents and does not duplicate a realtime stream.
- Route and compatibility code does not call all-page adapters. Infinite
  catalogs are driven by a visible Load more interaction or scroll boundary.
- Optional aggregate fields do not execute repository reads when omitted from
  the GraphQL selection.
- Mutation success patches authoritative returned data and narrowly invalidates
  derived snapshots.
- Search and typeahead reads debounce input, cancel obsolete requests, and keep
  the prior result only when doing so cannot misrepresent the selected scope.
- Compatibility fallbacks cache their negotiated capability instead of using
  failed requests as a routine branch condition.
