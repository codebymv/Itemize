# CRM GraphQL cutover contract

**Status:** Phase 1 contact CRUD, activities, bounded related content, aggregate contact profile, tag, pipeline, deal, and authenticated form-definition/submission-management operations, canonical CRM persistence, and the retained public-form boundary implemented; broader CRM characterization continues

**Evidence date:** 2026-07-17

## Decision

Authenticated contact, activity, tag, pipeline, deal, form-definition, and submission-management operations move to GraphQL. Contact CSV transfer and anonymous embedded-form retrieval/submission remain HTTP protocols owned by NestJS.

The CRM domain feeds workflow execution. Mutations commit domain state and a durable event/outbox record together; they never call the automation engine or a provider from a resolver. The event registry and worker boundary are defined by [Workflow execution cutover contract](workflow-execution-graphql-cutover.md).

The authoritative assignments for all 43 operations are in `graphql-operation-overrides.json`.

## Ownership

| Domain | NestJS owner | Target operations |
| --- | --- | --- |
| Contacts and bulk changes | `ContactsModule` | `contacts`, `contact`, `createContact`, `updateContact`, `deleteContact`, `bulkUpdateContacts`, `bulkDeleteContacts` |
| Aggregate profile/content | `ContactProfilesModule` | `contactProfile`, `contactContent` |
| Activities | `ContactActivitiesModule` | `contactActivities`, `addContactActivity` |
| CSV transfer | `ContactTransfersModule` | retained HTTP `exportContactsCsv`, `importContactsCsv` |
| Tags | `TagsModule` | `tags`, `createTag`, `updateTag`, `deleteTag`, `contactTagSuggestions` |
| Pipelines | `PipelinesModule` | `pipelines`, `pipeline`, `createPipeline`, `updatePipeline`, `deletePipeline` |
| Deals | `DealsModule` | `deals`, `deal`, `createDeal`, `updateDeal`, `deleteDeal`, `moveDeal`, `markDealWon`, `markDealLost`, `reopenDeal` |
| Forms | `FormsModule` | `forms`, `form`, `createForm`, `updateForm`, `deleteForm`, `duplicateForm`, `replaceFormFields` |
| Submission management | `FormsModule` | `formSubmissions`, `deleteFormSubmission` |
| Public embedded forms | `PublicFormsModule` | retained HTTP `getPublicForm`, `submitPublicForm` |

## Authentication and tenancy

All GraphQL operations use the verified organization context from `tenancy-graphql-context.md`. IDs outside the active organization return `NOT_FOUND`; referenced IDs supplied to an owned mutation return `BAD_USER_INPUT` without revealing another tenant's object.

- Contact assignees and deal assignees must be members of the active organization.
- A deal's pipeline, stage, contact, and assignee form one tenant-consistent tuple.
- Child activities, content, form fields, and submissions scope through an organization-owned parent.
- Related user/contact projections must enforce the same organization boundary even if legacy data contains invalid cross-tenant foreign keys.
- Anonymous public-form routes derive organization only from a globally unambiguous public form identity. They never accept an organization header.

The formerly unprotected aggregate profile endpoint trusted `organization_id` from the request and exposed cross-module PII. It now requires authentication and verified organization membership. Its stale contact-column mapping was also corrected and is covered against fresh PostgreSQL.

## Contacts

### Identity and fields

A contact requires at least one of first name, last name, email, or company. Status is `active`, `inactive`, or `archived`; source is `manual`, `import`, `form`, `integration`, or `api`.

Email is canonicalized to trimmed lowercase storage; blank values become `NULL`. It is deliberately not unique: manually created and imported duplicates, plus multiple email-less contacts, remain legal. Migration `canonical_contact_email_identity_v1` repairs historical values and installs a database trigger and check constraint so retained REST, GraphQL, import, public, automation, and direct SQL writers share the same boundary.

Email-to-contact resolution is organization-scoped and deterministic. Public forms and bookings serialize concurrent resolution and reuse the lowest eligible contact ID for the canonical email. CSV import skips existing and same-batch canonical duplicates only when `skipDuplicates` is true; false preserves duplicate rows. Campaign preview and recipient snapshots count one eligible recipient per canonical email and select the lowest contact ID. Provider-specific rewrites such as Gmail dot or plus removal are forbidden because they would merge distinct user-supplied identities.

GraphQL update inputs distinguish omitted from explicit null. The implemented and tested target rule is: omission preserves; explicit null or an empty string clears nullable scalar fields; explicit null resets JSON objects to `{}` and tags to `[]`; source and status cannot be null. The legacy partial `PUT` behavior remains inconsistent, so the frontend mutation flag is independent from the read flag. REST remains the default rollback path until the staging observation gate passes.

### Lists and aggregate profile

Contact lists use the shared strict page input and deterministic ordering. Existing sort fields are `created_at`, `updated_at`, `first_name`, `last_name`, `email`, and `company`; append `id` as the tie-breaker. Search currently matches first/last name, email, company, and phone with case-insensitive substring semantics.

`contactProfile` aggregates contact, invoices, signatures, payments, communications, activities, notes, lists, tasks, and bookings. Every collection now has its own retained-legacy bound, deterministic ID tie-breaker, total/truncation metadata, and `AVAILABLE`/`UNAVAILABLE` status. The parent contact is tenant-private and required; a child query failure preserves the healthy sections while marking only that section unavailable. The legacy aggregator silently replaces a failed child query with an empty array, making "none" indistinguishable from "failed". Fresh-PostgreSQL characterization proves this defect for the stale payment query (`p.date`) and nonexistent list junction tables; GraphQL uses the current payment timestamps and direct organization-qualified contact links instead.

### Bulk changes and limits

- Bulk operations accept a bounded, deduplicated list of integer IDs and mutate only rows in the active organization.
- Bulk assignment validates organization membership before changing any row.
- Tag add is set-like and idempotent; tag removal removes every requested string.
- Results distinguish requested, matched, changed, and rejected rows.
- Contact creation and import serialize the count check per organization so concurrent calls cannot exceed the plan limit.
- Import skips existing and same-batch canonical email duplicates when `skipDuplicates` is true; false preserves duplicates.

CSV export remains authenticated HTTP because it is a streamed file response. Import remains HTTP because it is a bounded bulk-transfer job, even though the current frontend parses CSV before sending JSON. `ContactTransfersModule` owns both retained routes with the same verified cookie, organization-membership, and CSRF boundaries as GraphQL. Import accepts at most 1 MiB, 10,000 rows, and 20 columns; returns at most 100 row errors plus the total and truncation state; and serializes duplicate and plan-limit decisions per organization. Export returns at most 50,000 deterministically ordered tenant rows. Both paths use the 30-second database/upstream timeout boundary, neutralize spreadsheet formulas, and emit payload-free audit metadata. Larger imports must move to a durable job rather than increasing these synchronous limits.

## Tag model

Three representations remain available during the compatibility window:

1. organization-owned rows in `tags` are the canonical tag identity;
2. `contact_tags` and `deal_tags` are the canonical membership stores used by campaign/segment code;
3. strings in `contacts.tags` and `deals.tags` are compatibility projections for retained REST, UI, import, form, and automation writers.

Migration `canonical_tag_model_v1` repairs historical drift without discarding either side: it merges case-insensitive duplicate rows to the lowest stable ID, removes cross-tenant junction corruption, creates canonical rows and junctions for array-only values, and projects junction-only membership into the arrays. A normalized organization/name unique index is the database concurrency boundary. Blank names are rejected and retained writers are bounded to 100 characters.

Database triggers keep both directions synchronized while legacy writers remain: array writes normalize whitespace/case to canonical spelling and update junctions; direct junction writes update arrays; tag rename preserves IDs and propagates to contact and deal projections; canonical deletion always removes contact and deal membership. Cross-organization junction writes fail at the database boundary. The retained tag list now counts junction membership set-wise and suggestions come from canonical rows. Fresh PostgreSQL proves migration repair, case-insensitive uniqueness, array/junction projection, contact/deal rename and deletion, tenant denial, and immediate campaign/segment evaluator visibility.

`TagsModule` now exposes `tags`, `contactTagSuggestions`, `createTag`, `updateTag`, and `deleteTag` against the canonical rows. List counts come from canonical contact/deal junctions; names remain case-insensitively unique per organization; color input is a six-digit hex value; rename and deletion use the existing database projections. GraphQL mutations require the retained CSRF proof, foreign IDs return tenant-private `NOT_FOUND`, and normalized duplicates return `BAD_USER_INPUT`.

## Pipelines and deals

### Pipeline stages

`pipeline_stages` is now authoritative. The `pipelines.stages` JSON array remains a writable compatibility projection for the retained REST, analytics, segment, and frontend consumers. Stage keys are trimmed, case-sensitive opaque identifiers; names, colors, and order may change without rewriting deal identity. Array position defines order for compatibility writes.

- A pipeline has a non-blank name and at least one valid stage.
- Stage IDs are unique within the pipeline and every stage has a name, order, and validated color.
- A stage referenced by a deal cannot be removed until deals are moved atomically.
- At most one default pipeline per organization is allowed. Legacy default changes serialize and a partial unique index protects direct and future writers.
- Delete locks and verifies the organization-owned pipeline before checking deals, preventing an existence leak.

Clean-database migration `canonical_pipeline_stage_model_v1` and numbered production migration `026_canonical_pipeline_stage_contract` run the same reconciliation. They treat the live JSON definition as the historical source for overlapping keys, discard unused stale shadow rows, and append any deal-referenced stage missing from JSON using retained metadata when available. Empty legacy pipelines receive one deterministic lead stage. Bidirectional triggers then keep compatibility JSON and canonical rows synchronized. Composite foreign keys make the deal's organization/pipeline tuple tenant-consistent and require every `(pipeline_id, stage_id)` to reference a canonical row. Core deal validation and segment-stage ownership now read the canonical table.

Fresh PostgreSQL proves normalized JSON writes, canonical ordering, duplicate-key rejection, direct row projection, in-use deletion denial, direct cross-tenant and unknown-stage denial, default uniqueness, and idempotent drift repair that preserves deal-referenced missing stages.

`PipelinesModule` now exposes `pipelines`, `pipeline`, `createPipeline`, `updatePipeline`, and `deletePipeline`. Reads use deterministic default/name/ID and deal-created/ID ordering, organization-qualified deal/contact/member projections, and tenant-scoped open-value aggregates. Writes normalize stage position into canonical order, validate opaque keys/names/colors, distinguish omitted description from explicit null, serialize default changes, reject removal of an in-use stage, and lock the tenant-owned pipeline before deletion checks. The board consumer can independently select GraphQL reads or definition mutations; deal transport uses its own independent flags.

### Deal contract

Deal value uses the shared Decimal string boundary; currency is an uppercase supported ISO code; probability is an integer from 0 through 100. Pipeline, stage, contact, and assignee references are validated in the active organization before insert/update.

Lifecycle is:

```text
open -> won
open -> lost(reason?)
won|lost -> open
won <-> lost through the explicit terminal mutation
```

`won_at` and `lost_at` are mutually exclusive; reopening clears both and the lost reason. Every lifecycle or stage transition records activity and a durable domain event in the state transaction.

`DealsModule` implements both reads and all seven writes. Deal mutations lock the tenant-owned row, validate the effective tenant-consistent reference tuple, and use the decimal-string boundary. Real stage and lifecycle transitions atomically write the deal state, a tenant-owned `deal_activities` row, an optional contact-timeline `deal_update`, and a durable workflow trigger. Repeated no-op transitions do not duplicate activity or event rows. Database checks make won/lost state mutually exclusive and forbid a lost reason without lost state.

`deal_stage_changed`, `deal_won`, `deal_lost`, and `deal_reopened` are canonical workflow trigger types. Existing stage-change automation remains compatible, while the new lifecycle types can be selected explicitly without overloading stage semantics.

Deal and pipeline lists require stable tie-breaker ordering. Aggregate counts/values must scope by organization even when the parent ID is globally unique.

## Forms

### Definitions and fields

Form type is `form`, `survey`, or `quiz`; status is `draft`, `published`, or `archived`. Creation, duplication, and full field replacement commit the definition and ordered fields atomically. Concurrent creates serialize the per-organization plan limit.

Every field requires a supported field type and non-blank label. Width, options, validation rules, conditions, and `map_to_contact_field` use explicit allowlists. Field IDs—not labels—are submission keys. Publishing now requires a complete valid definition; the compatibility migration converts historical `tel` fields to the canonical `phone` type.

`notify_on_submit` canonicalizes and deduplicates at most 20 addresses. Each accepted submission transactionally enqueues one idempotent email intent per address in the leased workflow side-effect outbox. Notifications contain form/submission references but no submitted field values. Provider delivery, retry, dead-letter state, and the resulting email log use the existing worker contract.

### Public HTTP contract

Public retrieval and submission remain anonymous HTTP for embeds and external clients. Submission has a dedicated 60-request-per-15-minute limiter in addition to the public route limiter, a 64 KiB domain payload cap, a 100-field cap, `no-store` responses, and no tenant header.

Every form now has a database-generated globally unique `frm_` public identifier. New copied links and the public browser route use that identifier. Legacy slugs remain readable only when exactly one published form matches globally; ambiguous slugs fail closed with `NOT_FOUND`.

Submission validates definition integrity, field membership, type, length, bounded safe patterns, numeric bounds, allowed options, conditional show/hide/require rules, and email/phone/date formats. Unknown fields and non-object payloads are rejected. The public React renderer implements the same conditional behavior and all supported controls. Redirects must be absolute credential-free HTTP(S) URLs at the authenticated route and database boundaries, and the browser revalidates the returned target before navigation.

Contact reuse/creation and submission share one transaction. Concurrent submissions with the same organization/email serialize, producing one reused contact and preserving both submissions. The submission, canonical `form_submitted` trigger, and notification intents commit together; provider work occurs only after commit. Composite database keys enforce the form/contact/submission organization tuple and submission data must remain a JSON object.

## Required parity scenarios

| Area | Required scenarios |
| --- | --- |
| Contacts | CRUD, identifier validation, search/filter/sort/page, omitted/null fields, plan-limit race, assignee membership, tenant denial |
| Profile/content | unauthenticated denial, forged organization header, tenant denial, each child collection, bounded results, child-query failure |
| Bulk/CSV | mixed-tenant IDs, duplicate IDs, assignment denial, tag set/add/remove, size limits, duplicate email modes, plan limit, CSV escaping/formula safety |
| Tags | case-insensitive create/rename race, propagation rollback, delete modes, tenant denial, canonical-store reconciliation |
| Pipelines | stage validation, stage-in-use rejection, concurrent default changes, delete existence privacy, deterministic aggregates |
| Deals | all reference-denial cases, Decimal/currency/probability validation, pipeline/stage move, lifecycle transitions, activity/event emission, concurrent update |
| Form definitions | plan-limit race, atomic create/duplicate/field replacement, publish validation, tenant denial, omitted/null settings |
| Public forms | global identity, rate limit, all field validations, unknown fields, same-email race, submission rollback, notification/event retry, redirect safety |

## Current evidence and exit gate

Fresh PostgreSQL suites now cover contact CRUD/tenancy, profile authentication and forged-header denial, assignee denial, idempotent bulk tag changes, concurrent contact limits, canonical email migration repair and direct/API/GraphQL normalization, legal duplicate and email-less contacts, both CSV duplicate modes, deterministic public-form and booking resolution, deduplicated campaign preview/snapshots, canonical tag drift repair/projection/tenancy and case-insensitive races, pipeline/deal CRUD and lifecycle, cross-tenant deal references, invalid stages, stage-in-use protection, default concurrency, form CRUD/fields/duplication/submissions, same-email public submission concurrency, and concurrent form limits. The retained NestJS CSV cases additionally prove authentication, membership and CSRF denial; tenant/status/tag export filtering; deterministic quoting and formula neutralization; strict row validation; both duplicate modes including concurrent imports; atomic plan-limit enforcement; bounded body/row/column/error behavior; and transactional contact, workflow-trigger, and activity writes. Public-form cases additionally prove global identity and ambiguous-slug denial, typed normalization and invalid/unknown/oversized rejection without writes, safe redirects, tenant/object database constraints, durable trigger and notification fan-out, worker delivery with the stable idempotency key, and replay-safe historical repair.

The NestJS `ContactsModule` implements the contact/profile operations, `ContactTransfersModule` implements the two retained CSV HTTP operations, `TagsModule` implements all five tag operations, `PipelinesModule` implements all five pipeline-definition operations, `DealsModule` implements all nine deal operations, and `FormsModule` implements seven authenticated form-definition operations plus two submission-management operations. Fresh-PostgreSQL tests prove dual REST/GraphQL contact parity; retained CSV authorization, validation, concurrency, limits, and side effects; canonical tag and pipeline behavior; deal validation, isolation, concurrency, and transition side effects; and form list/detail projections, default-field creation, serialized plan enforcement, omitted-versus-null settings, CSRF and tenant privacy, atomic field replacement with conditional-ID remapping, publish validation, duplication with fresh field IDs, deterministic submission paging, and tenant-private deletion. Anonymous public form retrieval/submission remains outside GraphQL.

The shared frontend adapters preserve their existing snake-case consumer shapes, selected-organization headers, session recovery, and CSRF acquisition while defaulting every migrated operation to REST. Deals add independent `VITE_DEAL_READS_GRAPHQL` and `VITE_DEAL_MUTATIONS_GRAPHQL` switches. Forms add independent `VITE_FORM_READS_GRAPHQL`, `VITE_FORM_MUTATIONS_GRAPHQL`, and `VITE_FORM_SUBMISSIONS_GRAPHQL` switches; `getPublicForm` and `submitPublicForm` never consult them. There is no standalone tag API consumer to switch. All 120 frontend cases pass, including RFC 4180-style quoted CSV fields and newlines, BOM/header aliases, malformed and oversized file rejection, deal decimal/list/lifecycle mapping, REST numeric normalization, form mapping, conditional-field transport, nullable clearing, submission paging/deletion, authenticated editor settings and ordered field replacement, and all prior public-form defenses. The five contact, two pipeline, two deal, and three authenticated-form flags remain disabled in deployed builds.

The 2026-07-17 mutation rehearsal used a disposable staging account and real credential login against GraphQL deployment `239de591-6f1a-4be7-b10a-08a59070cc15` through backend deployment `095eb5e5-a5c4-4da4-94e8-686fb1e842f6`. Browser create, edit, activity display, and delete passed with GraphQL writes and double-submit CSRF. PostgreSQL showed the expected create/update workflow triggers. Disabling only the mutation flag repeated create/edit/delete through REST while contact reads remained on GraphQL, proving rollback without data repair. Cleanup left zero temporary users, organizations, contacts, or triggers. Privacy-safe proxy and NestJS operation events now distinguish transport/layer and record one correlated request ID, operation name/type, numeric latency, operation/error counters, and stable error codes without source, variables, response data, or identity fields.

The instrumented staging observation used GraphQL deployment `f4c6c2e3-ea1e-402e-8abe-84e002654d85` and backend deployment `4ca6b703-cb38-4161-a608-4cecee272856`. Authenticated query and create/update/delete success, plus unauthenticated-query and missing-CSRF errors, produced six exactly paired proxy/NestJS events. Correlation IDs and operation metadata matched, expected `UNAUTHENTICATED`/`FORBIDDEN` counters were present, duration was numeric, and the events contained none of the fixture credentials or contact fields. Cleanup reported zero fixture users, organizations, contacts, and triggers. The mutation flag remains disabled in deployed builds and no production traffic uses these operations.

The activity transport and rollback gate passed on 2026-07-17 against GraphQL deployment `e7c7e836-9669-47bb-a4d4-dcfcec9467e8` through backend deployment `ff5cb00e-0bb6-4752-b402-b0f65e74eacb`. A disposable account used the real registration/login and contact-detail interfaces. The initial timeline read, one note write, and the refreshed timeline produced paired successful `ContactActivities`, `AddContactActivity`, and `ContactActivities` events. Disabling only `VITE_CONTACT_ACTIVITIES_GRAPHQL` retained the same session and data, read the GraphQL-created note through REST, created a second note through REST (`201`), and refreshed both notes with no later GraphQL activity traffic or data repair. Transactional cleanup reported zero residual users, organizations, contacts, or activities; temporary localhost CORS was removed; backend deployment `241377a4-feb7-49ae-9b06-7314836292d1` and GraphQL deployment `6e1b6e2c-6195-4516-8091-205637c412a5` restored clean current source. The activity flag remains disabled in deployed builds and production was untouched.

The related-content transport and rollback gate passed on 2026-07-17 against GraphQL deployment `5426037f-c308-4f0e-977f-25f6e2d13623` through backend deployment `a954a6c2-e165-4611-9924-c24ca3dbb68e`. A disposable verified account signed in through the real credential form, created a contact, and opened its Related Content tab. With `VITE_CONTACT_CONTENT_GRAPHQL` enabled, the browser rendered one linked list, note, and whiteboard; proxy request `5b268fd0-34fa-405c-80a4-d72b36f80abb` recorded `ContactContent` as HTTP `200` with zero errors. Disabling only the content flag retained the same session and rows and rendered the identical collections through `GET /api/contacts/69/content` (`200`) without a later `ContactContent` operation. Rollback required no data repair. Transactional cleanup reported zero remaining fixture accounts, temporary localhost CORS was removed, and backend deployment `a82a6554-0a4c-4021-80af-5a221ca4a834` restored clean current source. The content flag remains disabled in deployed builds and production was untouched.

The deal transport and rollback gate passed on 2026-07-17 against GraphQL deployment `2422d2e4-e13b-4867-9413-154d84b53d09`, initially through backend deployment `073f547d-f7f5-4df3-bade-75f6e17da418`. The first create probe exposed that the canonical stage reconciliation existed only in the clean-database migration stream; numbered production migrations `025_deal_activity_contract` and `026_canonical_pipeline_stage_contract` were applied, the production preflight was advanced to `026`, and staging then reported 26 executed migrations with none pending. Successful proxy events covered all seven GraphQL deal mutations: create, update, move, won, lost, reopen, and delete. The browser covered its available create, won, lost, and delete controls; authenticated calls covered update, move, and reopen because the current board exposes no edit/reopen control and hides terminal deals. The rollback probe then found that legacy lifecycle writes did not emit the canonical activity/workflow side effects. Backend deployment `2af1d2d3-ee5e-420c-8e59-9c1696f7e0b9` added transactional REST parity and proved the exact `reopened`, `won`, `reopened`, `lost`, `reopened` activity and workflow sequence while a repeated open-to-open call added nothing. With `VITE_PIPELINE_READS_GRAPHQL=true`, `VITE_DEAL_READS_GRAPHQL=true`, and `VITE_DEAL_MUTATIONS_GRAPHQL=false`, `PipelineReads` and `PipelineRead` remained on GraphQL while browser create/won/delete and authenticated reopen remained on REST; each REST change appeared through the next GraphQL read without repair. The REST adapter now also normalizes PostgreSQL Decimal strings so a full read rollback cannot concatenate pipeline totals. Cleanup left zero fixture users or organizations, temporary localhost CORS was removed, backend deployment `2f0937aa-7224-45df-b055-3f570ff67a48` restored clean current source, all deal flags remain disabled in deployed builds, and production was untouched.

The tag, pipeline-definition, and authenticated-form transport gate passed on 2026-07-17 against GraphQL deployment `2422d2e4-e13b-4867-9413-154d84b53d09`. Authenticated GraphQL calls covered tag list/suggestions/create/update/delete; pipeline list/detail/create/update/delete; form list/detail/create/update/field replacement/publish/unpublish/duplicate/delete; and deterministic submission paging/deletion. Browser controls covered the pipeline and form operations they exposed at that gate. The first form read found that `public_form_contract_v1` existed only in the clean-database startup stream while production intentionally runs numbered migrations: staging had the module marker but no `forms.public_id`. Numbered migration `027_public_form_contract` now delegates to the same idempotent implementation, production startup requires `027`, and staging reports the repaired schema. The cleanup status probe then found that `.dockerignore` excluded `scripts/migrations`, making a deployed image unable to discover pending numbered migrations; the production image now includes that directory and a regression test protects the packaging boundary. The rollback run kept pipeline and form reads on GraphQL while their mutation flags used REST; new rows and status changes appeared through the next GraphQL read without repair. It also exposed that REST form duplication returned copied fields but omitted `field_count` and `submission_count`; backend deployment `3b67fee4-0d0a-470d-a91e-580391ebe098` restored response parity, and a browser duplicate immediately rendered two fields before REST deletion. A cold-load header action also retained an organization-less create callback; the header now refreshes its callback when organization initialization completes. At that gate the authenticated frontend had no registered `/forms/:id` editor route, so successful create and Edit navigation ended at the 404 page. Pipeline update/delete and tag operations likewise had no complete browser consumer. Those absent surfaces were recorded constraints, not inferred browser coverage. Cleanup removed the disposable tenant and local server, temporary localhost CORS was removed, backend deployment `402d95d7-aace-4f31-a401-480841dad279` restored the complete current image, all tag/pipeline/form flags remained disabled in deployed builds, and production was untouched.

The authenticated form-editor gate then passed on 2026-07-17. The frontend now registers protected route `/forms/:id` and exposes Settings, Fields, and Submissions consumers for form mutation, ordered field replacement, deterministic submission paging, and submission deletion. A disposable verified account used the real interface with all three form flags enabled: the browser created and opened a form without a 404, saved settings, edited, added, and reordered fields, published the form, rendered a seeded submission, deleted it, and refreshed the count. Disabling only the mutation and submission flags retained GraphQL reads while settings, field replacement, unpublish, submission paging, and submission deletion passed through REST; every REST change appeared through the next GraphQL read without data repair. Deleting a condition source also strips dependent conditions before replacement, and hidden validation/condition metadata survives ordinary edits. Cleanup removed the disposable tenant and submissions, temporary localhost CORS was removed, and backend deployment `b077a8be-e5a4-47b3-aaa8-cf96f54ea0fd` restored clean staging with 27 executed migrations, zero pending migrations, database health connected, and direct/proxied GraphQL readiness `ready`. All form flags remain disabled in deployed builds and production was untouched.

The aggregate-profile operation gate passed on 2026-07-17 against GraphQL deployment `95142285-8705-49c6-b6ac-781230d8bf6e` through the retained legacy origin. A complete disposable profile populated all nine child domains. GraphQL request `39666ef1-4b7e-49af-8c4f-d5ed22e5c3ac` returned HTTP `200`, all sections `AVAILABLE`, one row per section, and no truncation. The parallel REST request returned HTTP `200` while reproducing the legacy payment/list masked failures; GraphQL returned the current-schema payment and direct linked-list rows. Outsider request `0bebcf0d-1360-4b31-adef-f056b2f1008f` returned `NOT_FOUND`. Cleanup removed both disposable organizations and left zero fixture users. Readiness remained `ready`, no browser transport flag was added because the endpoint has no current frontend consumer, and production was untouched.

The retained CSV transport and rollback gate passed on 2026-07-17 against GraphQL deployment `0e3e01c8-fec1-4d7e-a3c5-6ab94c9e6712` through the public legacy origin. Backend deployment `3d2ade6e-d88d-4a1e-9a2c-6e8f52e46dbf` enabled the narrow two-route proxy. A disposable verified account imported one valid row, skipped one canonical duplicate, and returned one bounded validation error through NestJS; export returned HTTP `200`, `private, no-store`, tenant-filtered quoted CSV with spreadsheet-formula protection. The database recorded the contact plus one `contact_added` trigger and one `Contact Created` activity. Removing only `CONTACT_TRANSFERS_NESTJS_ENABLED` and deploying current backend source as `193ab513-f74e-4565-8b9c-a7e3a8dab863` retained the same session and data: legacy export read the Nest-created contact and formula-safe value, legacy import returned its distinct retained response shape and added a second contact, and legacy export immediately read both without repair. Transactional cleanup removed the disposable user and organization and left zero contacts or triggers. The proxy flag remains absent, staging is on legacy routing, production was untouched, and the service-local `backend-v2/railway.json` prevents the GraphQL service from inheriting the frontend Railway manifest.

The broader CRM slice is not ready for traffic until:

1. profile failure-injection and consumer behavior have complete tests;
2. profile, tag, and pipeline-definition browser coverage becomes required when a frontend consumer is introduced.
