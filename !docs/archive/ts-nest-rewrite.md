# Itemize Backend Rewrite Plan — TypeScript / NestJS / GraphQL

> Status: Phase 1 foundation implementation started in `backend-v2/`. The authoritative gates and current evidence are maintained in `!docs/API/graphql-nestjs-cutover-readiness.md`.

## Current State

The `itemize.cloud` backend is a Node.js/Express application located in `backend/src/`. It has grown organically over several months and now contains a large, flat REST surface.

- **PostgreSQL Database**: The database layer is PostgreSQL. Raw SQL queries are executed directly using a `pg` pool object injected into routes on startup.
- **Custom JS Migrations**: Database tables and column evolutions are managed sequentially via 20+ JavaScript files (`backend/src/db_*_migrations.js`) executing raw SQL queries at boot, tracked in production via a `schema_migrations` table check.
- **~40 Route Modules**: Routes are declared as function exports taking `(pool, authenticateJWT, broadcast)` arguments and mounted in [register-api-routes.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/bootstrap/register-api-routes.js).
- **Cookie Auth**: Users authenticate via JWT stored inside the `itemize_auth` cookie.
- **Multi-Tenancy**: Scoped via [organization.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/middleware/organization.js) middleware. The active `organization_id` is resolved from query params, body parameters, or the `X-Organization-Id` header, falling back to the user's default organization in the DB, and checking membership role against the `organization_members` table.
- **Real-time WebSockets**: Managed in [websocket.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/lib/websocket.js) using raw Socket.IO. It maps authenticated users to `user-canvas-${userId}` rooms and visitors to shared resource rooms (`shared-list-${shareToken}`, etc.) to broadcast mutations and track live viewer counts.
- **Background Jobs**: Driven by `node-cron` in [scheduler.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/scheduler.js), running billing, invoicing, and signature reminder jobs at scheduled intervals.
- **No Active Users**: The app is greenfield, so a rewrite is feasible without data migration risk.

Key entry points for context gathering:
- [index.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/index.js) — Express configuration, middleware sequencing, and deferred startup initialization.
- [register-api-routes.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/bootstrap/register-api-routes.js) — Route mounting registry.
- [db.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/db.js) — Pool configuration and startup migration orchestrator.
- `backend/src/routes/` — Individual feature routes containing business logic and SQL.
- `backend/src/db_*_migrations.js` — Database table schemas and indexes.
- [models.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/models.js) — Legacy Sequelize definitions (unused in runtime API).

## Why a Rewrite Makes Sense

Because the app has no users yet, this is a rare opportunity to replace the foundation rather than patch around it. The current architecture has accumulated technical debt that will slow down every future feature:

- No compile-time type safety across API contracts.
- Repeated boilerplate for validation, pagination, filtering, tenant scoping, and error handling.
- No clear service layer — SQL and business logic are mixed in route handlers.
- Adding new cross-cutting features (e.g., a unified dashboard, a mobile app, a public API) requires more custom REST endpoints.
- Testing is difficult because dependencies are not injected.

## Recommended Target Architecture

### Stack

| Layer | Recommendation | Rationale |
|-------|----------------|-----------|
| Language | TypeScript | Full type safety for API contracts, DTOs, and DB queries. |
| Framework | NestJS | Standardized modular architecture, dependency injection, validation pipes, testing, and native support for GraphQL, Schedule, and WebSockets. |
| Data Access | Prisma or Drizzle | Introspect existing Postgres schema. Drizzle is highly recommended if raw SQL alignment and execution speed are preferred; Prisma is excellent for automatic client generation and GraphQL integration. |
| API Style | REST first, then GraphQL | Implement NestJS REST controllers to map existing routes. Add `@nestjs/graphql` resolvers sequentially on top of the same core services. |
| Auth | Keep existing JWT cookie authentication | Implement a NestJS `JwtAuthGuard` that extracts the JWT token from the `itemize_auth` cookie and attaches the user payload to the request. |
| Real-time | NestJS WebSockets Gateway | Map Socket.IO handlers to a NestJS `@WebSocketGateway`. Retain room subscriptions (`user-canvas-${userId}`) and anonymous token rooms. |
| Background Jobs | NestJS Schedule (`@nestjs/schedule`) | Replace `node-cron` in [scheduler.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/scheduler.js) with `@Cron()` decorators inside a dedicated scheduler service. |

### Domain Modules (proposed)

Mirror the existing route structure but as NestJS modules. Each module owns its controller(s), service(s), DTOs, and repository/Prisma calls:

- `AuthModule`
- `UsersModule`
- `OrganizationsModule`
- `ContactsModule`
- `ListsModule` / `CanvasModule`
- `NotesModule`
- `WhiteboardsModule`
- `WireframesModule`
- `VaultsModule`
- `CategoriesModule` / `TagsModule`
- `PipelinesModule`
- `InvoicesModule` (including estimates and recurring)
- `BillingModule`
- `CampaignsModule`
- `SegmentsModule`
- `EmailTemplatesModule` / `SmsTemplatesModule`
- `FormsModule`
- `SignaturesModule` / `EsignatureModule`
- `CalendarsModule` / `BookingsModule`
- `WorkflowsModule`
- `AnalyticsModule`
- `SearchModule`
- `AdminModule`
- `WebhooksModule`

### Cross-Cutting Concerns

These should be implemented as guards, interceptors, pipes, or custom decorators:

- **Tenant scoping**: `CurrentOrganization` parameter decorator + `OrganizationGuard`.
  > [!NOTE]
  > To avoid memory overhead and latency with NestJS request-scoped DI, keep database services as singletons. Use Node's `AsyncLocalStorage` to store the active `organization_id` (extracted by the `OrganizationGuard`) and propagate it down to database queries transparently.
- **Auth**: `JwtAuthGuard` mapping the `itemize_auth` cookie.
- **RBAC/admin checks**: `RolesGuard` matching roles from `organization_members`.
- **Validation**: Global `ValidationPipe` using `class-validator` to replace `backend/src/validators/`.
- **Pagination / filtering**: Shared `PaginationDto` and `SortDto`.
- **Logging / correlation IDs**: NestJS interceptor using the existing tracing headers.
- **Rate limiting**: `@nestjs/throttler` mapped to match custom route limits (like position updates).
- **Subscription/feature gating**: Custom guards or service-level checks based on metadata in [subscription.constants.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/lib/subscription.constants.js).

## Proposed Roadmap

### Phase 1: Foundation
1. Set up a new `backend-v2/` (or `api/`) NestJS + TypeScript + Prisma project.
2. Model the core schema in Prisma by consolidating the migration files.
3. Configure auth guards, tenant context, and a global exception filter.
4. Seed a minimal dev database.

### Phase 2: Core Modules in NestJS (REST)
Port the highest-value modules first:
- Auth / Users / Organizations
- Contacts
- Lists / Canvas
- Notes
- Pipelines
- Invoices

Use this phase to establish patterns for DTOs, services, repositories, controllers, and tests.

### Phase 3: Remaining Feature Modules
Port the rest of the route modules as NestJS modules. Keep them behind REST controllers so the existing frontend continues to work with minimal changes.

### Phase 4: GraphQL Layer
Add `@nestjs/graphql` (code-first recommended) and expose resolvers that delegate to the existing services. Start with:
- A unified dashboard query.
- Contact/org detail views.
- Any new frontend surfaces that benefit from nested data.

Do not remove REST endpoints yet; serve both until the frontend is migrated.

### Phase 5: Frontend Migration
Migrate the React frontend incrementally:
- Keep React Query for REST where it already works.
- Introduce Apollo Client or a GraphQL client for new aggregate views.
- Replace REST calls with GraphQL queries only where there is clear benefit.

### Phase 6: Cleanup
Once the frontend no longer uses a REST endpoint, deprecate it. Eventually the old Express backend can be removed.

## Why GraphQL Now vs. Later

GraphQL is a good fit for this app because the domain is relationship-heavy and multi-tenant. The target public API is now GraphQL on NestJS:

- Lead with transport-neutral domain services and GraphQL schema design; do not rebuild the entire REST surface in NestJS first.
- Keep business logic out of controllers and resolvers so protocol endpoints can share the same services.
- Add a temporary NestJS REST adapter only for a consumer that cannot migrate with its GraphQL operation.
- Use the evidence-backed gates in [GraphQL + NestJS cutover readiness](!docs/API/graphql-nestjs-cutover-readiness.md).

## Key Decisions for the Next Agent

1. **Project location**: Create `backend-v2/` alongside the existing backend for a side-by-side low-risk migration.
2. **Schema Introspection Strategy**: 
   > [!IMPORTANT]
   > Do not manually convert the sequential JavaScript migrations in `db_*_migrations.js` into Prisma/Drizzle schema formats. Instead, boot the current application to generate a complete local database, dump the schema using PostgreSQL tools (e.g. `pg_dump`), restore it into a fresh dev database, and use `npx prisma db pull` or `npx drizzle-kit introspect` to generate the schemas automatically.
3. **Prisma vs. Drizzle**: Choose Drizzle if you want direct control over SQL query mapping (matching the current raw SQL design) and minimal memory footprints; choose Prisma if you prefer rapid schema mapping and automated Prisma client typing.
4. **Multi-Tenancy Isolation**: Implement `AsyncLocalStorage` to store organization IDs dynamically per request, enabling database clients to scope queries without forcing NestJS service/controller classes into high-overhead request-scoping.
5. **Auth Provider**: Keep the custom JWT cookie (`itemize_auth`) and Google OAuth routes to ensure the existing React frontend is unaffected during early phases.
6. **Frontend data client**: Continue with TanStack Query hitting REST, and introduce Apollo Client or similar tools incrementally when GraphQL queries are added.
7. **Testing Strategy**: Use the generated REST inventory and semantic parity gates in [GraphQL + NestJS cutover readiness](!docs/API/graphql-nestjs-cutover-readiness.md). Establish service, PostgreSQL integration, GraphQL operation, protocol-contract, and consumer tests early.

## Testing & Pre-Cutover Verification Plan

### Existing Test Coverage Analysis
The earlier 8-suite/73-test analysis is stale. The 2026-07-15 baseline has 412 static route declarations (407 unique resolved method/path operations), 38 backend test files, 16 real-PostgreSQL integration suites, and 6 frontend test files. Existing integration coverage includes several core domains and cross-organization denial cases, but it remains much smaller than the API surface.

The authoritative counts, known gaps, and gates are maintained in [GraphQL + NestJS cutover readiness](!docs/API/graphql-nestjs-cutover-readiness.md) and the generated [REST surface baseline](!docs/API/generated/rest-surface.md).

### Pre-Cutover Testing Requirements
To safely transition traffic from the Express backend to the new NestJS backend (NestJS REST API), we must establish a verification harness. Before cutting over any path, we should implement:

#### 1. Black-Box Contract Parity Tests
Write scenario tests that characterize key legacy REST behavior and exercise the corresponding GraphQL operation.
- These tests should execute against a **real PostgreSQL test database instance** (rather than mocking the pool client) to validate actual SQL logic.
- Run this test suite against the legacy Express server to establish a baseline.
- Run the same semantic scenario against NestJS GraphQL and compare authorization, normalized database state, and side effects. REST status/envelope equality is not a GraphQL cutover requirement.

#### 2. Key Security & Functional Test Targets
Focus on writing parity tests for these high-risk areas before beginning the cutover:
- **Cookie & Session Auth Parity**: Ensure the new backend reads/writes cookies (`itemize_auth`, `itemize_refresh`) with the exact same path, domain, secure flag, and duration so active users are not logged out.
- **Multi-Tenant Data Isolation**: Assert that a client authenticated to Organization A receives a `403 Forbidden` or `404 Not Found` when trying to fetch, modify, or delete resources belonging to Organization B.
- **Subscription limit enforcement**: Assert that the limits defined in [subscription.constants.js](file:///C:/Users/roxas/OneDrive/Desktop/PROJECTS/itemize.cloud/backend/src/lib/subscription.constants.js) (such as max contacts, workflows, or landing pages allowed on the `starter` plan) are correctly rejected with the same payload structure.
- **Websocket Event Parity**: Verify that the events (`listUpdated`, `noteUpdated`, `viewerCount`) broadcasted by the new NestJS Gateway match the legacy socket room structure and payloads exactly.

## Files to Review for Context

- `backend/src/index.js`
- `backend/src/bootstrap/register-api-routes.js`
- `backend/src/routes/*.routes.js` (especially `contacts.routes.js`, `organizations.routes.js`, `pipelines.routes.js`, `invoices.routes.js`, `lists.routes.js`)
- `backend/src/db_*_migrations.js` (the full set; these define the real schema)
- `backend/src/lib/subscription.constants.js`
- `backend/src/middleware/organization.js`
- `backend/src/auth.js`
- `frontend/src/` — understand how the frontend calls the API and whether it uses shared API utilities

## Non-Goals for the Rewrite

- Do not migrate the frontend framework (keep React + Vite).
- Do not rewrite Socket.IO real-time features in Phase 1.
- Do not add GraphQL subscriptions until after the core GraphQL read surface is stable.
- Do not change deployment target initially (keep Railway + PostgreSQL).

## Summary Recommendation

**Proceed with a TypeScript + NestJS rewrite using transport-neutral domain services and GraphQL as the target public API.** Migrate vertical slices behind evidence-backed gates, retaining legacy REST until each consumer moves; do not attempt a simultaneous big-bang cutover.
