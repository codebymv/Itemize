# Production readiness audit — 11 Sep 2026

**Scope:** security surface, deploy/runtime configuration, worker ownership, dependency health, release gates, tests.
**Method:** read the NestJS bootstrap, guards, CORS, rate limits, webhooks, uploads, storage, Dockerfiles, Railway config, and the SPA server; sampled 82 repositories for tenant scoping; ran `npm audit`, `release:contracts`, both production builds, `build:check`, and both unit suites.
**Not covered:** live Railway environment values (cannot be read from the repo — every "verify" item below is a dashboard check), load testing, penetration testing, the fresh-database integration gate (`release:integration`, needs Docker).

## Verdict

**Follow-up:** See [launch-hardening-2026-09-11.md](launch-hardening-2026-09-11.md)
for live verification and corrections. In particular, the production local-disk
fallback claim below is incorrect for the cited providers, most production
worker flags were already enabled, and a patched Multer release is available.

The application layer is in good shape: cookie-based JWT with double-submit CSRF, bcrypt(12), per-identity auth throttling, signature-verified webhooks on every provider, malware-scanned and structurally validated uploads, tenant-scoped SQL everywhere sampled, an admin guard, a plan-entitlement guard, GDPR-style export and deletion, 163 tables with 567 indexes, and green unit suites on both sides (1,402 frontend, 942 backend).

The risk is concentrated in the **gap left by the Express retirement (24 Aug 2026)**. Several production guarantees lived in the Express ingress and were never re-created in Nest, and the docs still describe them as present. Those are the P0/P1 items.

## Findings, ranked

### P0 — verify or fix before calling it launched

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 1 | **Every background worker defaults OFF, and the runtime that used to own them is deleted.** Recurring invoice generation, trial reminders, signature delivery/reminders, estimate email delivery, review-request delivery, admin/direct-message delivery, subscription/email/social webhook jobs, workflow scheduling, calendar sync, and the Socket.IO realtime host are each gated by a `*_NEST_*_ENABLED` / `*_SCHEDULER_ENABLED` flag that is `false` unless the env says `'true'`. The startup validator only checks the flags are well-formed booleans; it does not warn when all of them are off. | `backend/src/common/runtime-config.ts:3-27`; `backend/.env.example:90-112`; `!docs/Deploy/runtime-and-worker-ownership.md` (dated 23 Aug, still describes the two-runtime model). | **Verify in Railway** that every flag the product depends on is `true` on the GraphQL service. Then: flip the code defaults to `true` for the flags that have no remaining "legacy owner" (the conflict pairs in `CONFLICTING_OWNERS` can be dropped along with the `LEGACY_*` keys), and make the validator log a loud startup summary of which workers this instance owns. Rewrite `runtime-and-worker-ownership.md` for the single-runtime world. |
| 2 | **No security headers on either origin.** Helmet was only ever in the Express backend (`helmet ^7.1.0` in the pre-retirement `backend/package.json`); Nest never got it, and the SPA server sends only `Content-Type`/`Cache-Control`/`Vary`. Result: no HSTS, no `X-Content-Type-Options`, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no CSP on `itemize.cloud` or `api.itemize.cloud`. The checklist and `content-security-policy.md` both claim "Helmet middleware" is enforcing this. | `backend/src/configure-app.ts` (no helmet); `frontend/scripts/serve-spa.mjs:44-49`; `!docs/Security/content-security-policy.md:28`. | Add `helmet` to `configureApp` (keep `contentSecurityPolicy` off for the API, or scope it to the docs/help routes). Add a fixed header set to `serve-spa.mjs` and a CSP for the app shell (`script-src 'self'`, `connect-src 'self' https://api.itemize.cloud wss://api.itemize.cloud https://connect.stripe.com`, `font-src fonts.gstatic.com`, `style-src 'self' 'unsafe-inline' fonts.googleapis.com`, `img-src 'self' data: blob: https:`, `frame-ancestors 'none'`). Test the widget embed paths separately — they need `*`. Correct the two docs. |
| 3 | **Subscription checkout is hard-disabled in production unless `ITEMIZE_SUBSCRIPTION_BILLING_ENABLED=true`.** Any paid upgrade throws `SERVICE_UNAVAILABLE / BILLING_ISOLATION_REQUIRED`. | `backend/src/billing/billing.service.ts:472-482`. | Verify the flag is set on Railway; if the isolation reason no longer applies, remove the kill-switch. |
| 4 | **File storage silently falls back to the container's disk when AWS credentials are absent.** Signature PDFs and invoice logos would be written to `uploads/` inside an ephemeral Railway container and vanish on the next deploy. Production validation requires only `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`. | `backend/src/signature-files/signature-file-storage.provider.ts:275-279`; `backend/src/invoice-logo-cleanup/invoice-logo-storage.provider.ts:157-161`; `runtime-config.ts` production block. | Verify `AWS_ACCESS_KEY_ID/SECRET/BUCKET/REGION` on Railway. Make the validator refuse to boot in production without S3 (or an explicit `STORAGE_LOCAL_OK=true` for staging). |

### P1 — fix this week

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 5 | **The documented release gate is red.** `npm run release:check` fails at `build:check`: `icons` chunk is 52.26 KB against a 52.00 KB budget. Railway's frontend deploy runs plain `vite build`, so this does not block deploys — it just means the pre-release gate cannot pass and will be ignored. | `tmp/audit/gates.txt`; `frontend/scripts/verify-build-size.js:18`. | Either trim the icon barrel (one import likely pulled in a new glyph) or raise the budget to 56 KB with a note. Consider running `build:check` in the Railway build so drift is caught at deploy time. |
| 6 | **`npm audit`: 2 high in production deps.** `multer` (DoS via crafted multipart field names — no upstream fix through `@nestjs/platform-express`), `js-yaml` (fix available), `qs` (moderate, fix available), `@tiptap/core` prototype-pollution (needs the v3 major). Frontend: `browserslist` high and `js-yaml` high, both fixable. The checklist says audit was clean on 21 Aug. | `tmp/audit/npm-audit.txt`. | `npm audit fix` at root and in `frontend/` (regenerate the frontend lockfile with `--workspaces=false`). For multer: uploads already have hard size limits and are behind auth, so document the accepted risk and pin a watch on the advisory. Plan the TipTap v3 upgrade. Add Dependabot/Renovate so "verify regularly" stops being manual. |
| 7 | **No GraphQL depth or complexity limit.** Apollo 5 ships without one; a single authenticated user can send a deeply nested or heavily aliased query and pin a worker. The global limiter (1000 req/15 min) does not bound per-request cost. | `backend/src/app.module.ts:189-198`; no `validationRules`. | Add `graphql-depth-limit` (depth ~10) and a complexity plugin, or at least `maxAliases`/`maxDirectives` via `@escape.tech/graphql-armor`. |
| 8 | **Auth rate limiting is in-process memory.** Correct on one Railway replica; if the service is ever scaled horizontally the per-IP/per-identity buckets are per-instance and the effective login ceiling multiplies. Same for `express-rate-limit`'s default memory store. | `backend/src/auth/auth-rate-limit.service.ts:11`; `backend/src/common/api-rate-limit.ts`. | Acceptable at one replica — document it as a scaling precondition. Move to a Postgres- or Redis-backed store before scaling. |
| 9 | **Runtime docs describe a system that no longer exists.** `runtime-and-worker-ownership.md`, `preproduction-checklist.md` (Helmet, "npm ci" — the Dockerfile uses `npm install --legacy-peer-deps` with no backend lockfile), `content-security-policy.md`, and `postgres-restore-drill.md` (references `backend/scripts/run-migrations.js` and `schema_migrations`; README says `_migrations` and `db/`) all predate the cutover. A future operator following them will make wrong decisions. | Files above. | One docs pass after fixes 1–4 land. |
| 10 | **Restore drill never completed a restore.** The 18 Aug drill provisioned an empty Postgres and deleted it; nobody has yet restored a Railway snapshot into a service and booted the app against it. Railway backups are dashboard-only with no CLI. | `!docs/Deploy/postgres-restore-drill.md:6-13`. | Do the real drill once before launch; record the RPO the snapshot cadence actually gives you. |

### P2 — hygiene and hardening

| # | Finding | Fix |
|---|---|---|
| 11 | Backend Docker image builds without a lockfile (`backend/package-lock.json` and `db/package-lock.json` do not exist; the root workspace lock is not copied). Builds are not reproducible and `--legacy-peer-deps` masks conflicts. | Copy the root lockfile into the image and use `npm ci --workspace`, or generate per-workspace lockfiles the way the frontend does. |
| 12 | `VITE_SENTRY_DSN` is not in `frontend/.env.production`; if Railway does not set it, frontend error tracking is silently off (the code logs once and continues). Backend Sentry is DSN-gated the same way. | Verify both DSNs are set; consider making `initSentry` warn visibly in the Railway build log when the DSN is missing in production mode. |
| 13 | Tracked junk: `frontend/src/pages/canvas.tsx.backup`, `frontend/src/FULL_IMPLEMENTATION_STATUS.md`, `frontend/src/FULL_PLATFORM_SUMMARY.md`. | Delete. |
| 14 | 11 `console.log/error` calls in backend `src/` bypass the Nest logger (no request-id correlation). | Route through `Logger`. |
| 15 | Preproduction checklist items still open that matter for a paid product: MFA for admin accounts, centralized log retention, incident-response runbook, data-retention policy. | Pick owners and dates; MFA for the platform-admin role is the highest-value one since `AdminAccessGuard` gates plan changes and user data. |

## What checked out (no action)

- **Auth:** HttpOnly/Secure cookies, `SameSite=None` in production paired with a timing-safe double-submit CSRF guard on mutations; bcrypt cost 12; access/refresh split; JWT secret ≥32 chars enforced at boot; per-IP+identity throttles (20 standard / 10 strict per 15 min).
- **Webhooks:** Stripe (invoice + subscription) `constructEvent` on raw body; Resend via svix headers; Twilio request validation; Meta `x-hub-signature-256`; workflow webhooks with `x-itemize-signature`. Missing secrets fail closed with 503.
- **Uploads:** 1 MB JSON/urlencoded cap; signature PDFs go through a structural validator (20 MB per stream / 100 MB decoded) and a malware scanner; logo filenames are regex-constrained and path-traversal checked.
- **Tenancy:** all 237 `WHERE id = $1` sites sampled are either on `organizations`/`users` keyed by the tenant id itself, or carry `AND organization_id = $2` / `AND user_id = $2` on the following line. Four contract specs (`graphql-authorization-boundary`, `http-authorization-boundary`, `consumer`, `mutation-replay`) pass.
- **Secrets:** nothing committed; `sk_test_*` strings are test fixtures and unconfigured-fallback placeholders only.
- **CORS:** allowlisted credentialed origins; public widgets get `*` without credentials on regex-matched paths only.
- **Error surface:** `INTERNAL_SERVER_ERROR` messages are replaced with a generic string; stack traces never leave the server; GraphiQL disabled in production; introspection follows Apollo's production default (off).
- **Runtime:** non-root container user, `tini`, graceful shutdown hooks, Postgres pool with 10 s connect / 30 s statement timeouts, `/health` readiness wired to Railway with a fail-closed migration pre-deploy.
- **Frontend:** 313 test files / 1,402 tests pass; production build has no sourcemaps; bundle within budget except the 0.26 KB icons overage above; legal pages (`/legal/terms`, `/legal/privacy`) and cookie consent present.

## Gate results (this run)

| Gate | Result |
|---|---|
| `npm run release:contracts` | PASS (docs in sync, 141 env vars covered, 4 contract suites / 10 tests) |
| `npm run build:graphql` | PASS |
| `npm run build:frontend` | PASS (1m 11s) |
| `npm run build:check` | **FAIL** — icons 52.26 KB > 52.00 KB |
| `npm run test:frontend` | PASS — 313 files, 1,402 tests |
| `npm run test:graphql` | PASS — 195 suites, 942 tests |
| `npm audit --omit=dev` (root) | 6 (3 moderate, 3 high) |
| `npm audit` (frontend) | 10 (1 low, 7 moderate, 2 high) |
| `npm run release:integration` | not run (Docker) |

## Suggested order of work

1. Railway dashboard: confirm worker flags, `ITEMIZE_SUBSCRIPTION_BILLING_ENABLED`, AWS S3 vars, both Sentry DSNs. (30 min, no code.)
2. Helmet on the API + headers/CSP on the SPA server; verify with `curl -I` against both origins. (half day)
3. Flip worker defaults, delete `LEGACY_*` keys, add the startup ownership summary and the S3 boot check. (half day)
4. `npm audit fix` both trees; regenerate the frontend lockfile with `--workspaces=false`; fix the icons budget. (1 hr)
5. GraphQL depth/complexity limits. (1 hr)
6. Real restore drill; docs pass over the four stale runbooks. (half day)
