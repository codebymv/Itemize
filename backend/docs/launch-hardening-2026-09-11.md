# Launch hardening — 2026-09-11

## Scope and deployment status

This follow-up verifies the earlier audit against the repository and Railway,
implements local hardening, and runs automated checks. Production configuration
and customer data were inspected read-only. No deployment, worker activation,
email/SMS delivery, payment, or customer-account change was performed.

The user explicitly excluded backup setup and the production restore drill.
This work is not a claim that the entire product is ready for unrestricted launch.

## Verified production observations

- The project contains the frontend, one Nest API replica, PostgreSQL, and the
  signature scanner. No separate legacy API or scheduled worker service appeared.
- Billing is explicitly enabled. Invoice, trial, signature, estimate,
  reputation, admin-email, webhook, workflow, and realtime ownership flags were
  verified enabled. See Deploy/runtime-and-worker-ownership.md for exact names.
- Calendar sync, direct-message delivery, and social-message delivery flags are
  absent. Their queues were empty at inspection time.
- Campaign delivery has a one-shot command and no continuous module scheduler;
  no campaign jobs were present. Invoice-email recovery, campaign test-email
  recovery, and logo cleanup also need an explicit external cadence.
- S3 variables and both Sentry DSN variable names are present. An authenticated
  HeadBucket request from the running API succeeded. No secret values were recorded.
- The live homepage and API /health response lacked the security headers before
  this change. Those production responses remain unchanged until rollout.
- Railway's Backups page says backups/PITR require Pro on this account.

## Corrections to the original audit

The cited signature and invoice-logo providers already reject local-disk writes
in production. Missing S3 would cause upload failures, not the alleged silent
ephemeral-disk fallback. Startup validation was still worth adding.

The audit's default-off worker observation did not establish that production
workers were all disabled. Most were already explicitly enabled.

Multer 2.3.0 is now published. The framework still pins 2.2.0, so the root override
and direct dependency now select the patched 2.3.0. The previous "no fix" conclusion
is no longer accurate. Auditing only textual SQL predicates cannot establish
complete authorization correctness, and unit counts alone are not launch proof.

## Implemented changes

- Helmet on the API, preserving cross-origin public resources, OAuth popups,
  existing CORS, and route-specific PDF/content policies.
- Frontend CSP with hashes for shipped boot scripts, no inline event handlers,
  integration allowlists, framing protection, referrer policy, nosniff, and
  production HSTS. Malformed URL encoding returns 400 instead of rejecting the
  asynchronous request handler. Loopback production previews can use HTTP.
- GraphQL maximum 10,000 parser tokens, depth 12, list depth 4, self-reference
  depth 3, expanded selection complexity 1,000, and analysis work limit 5,000
  nodes. Complexity runs for each request, including cached documents. Repository
  pagination caps remain necessary; selection count is not a full database cost model.
- Production boot requires the shared-storage credentials, bucket, and region.
  Startup logs summarize worker ownership and warn about missing billing/Sentry.
  Existing worker defaults and the billing switch are preserved.
- Railway API image uses the root lockfile and npm ci for backend/database
  workspaces. The deprecated standalone backend/Dockerfile is not the deployed
  build path and remains outside this build change.
- Compatible dependency updates remove high/critical audit findings. TipTap's
  moderate production advisory remains; the Vitest moderate advisory remains
  in development dependencies. Both require coordinated major upgrades.
- Icons budget is 54 KiB against the measured 52.26 KiB baseline. Railway's
  frontend build runs the size gate. CI adds CSP tests and the fresh-database
  integration gate, fails on high production advisories, and Dependabot checks
  root and standalone frontend dependency graphs weekly.

## Verification

Final results (local logs under tmp/):

| Check | Result |
| --- | --- |
| Backend unit/contract suite | 196 suites, 947 tests passed |
| Frontend suite, including CSP tests | 314 files, 1,404 tests passed |
| Fresh-database integration after final code/dependency changes | 58 suites, 451 tests passed; disposable database removed |
| release:check | Passed: docs/env/contracts, both builds, bundle budgets |
| Frontend lint | 0 errors, 55 warnings |
| Linux Docker builder and full production image | Both built with npm ci; runtime dependency resolution and bundled migration entrypoint verified as non-root |
| Standalone frontend npm ci dry run | Passed with its independent lockfile |
| Production-dependency audit on local lockfile | 0 high/critical; 2 moderate entries from TipTap |
| Diff whitespace and docs mirror | Passed |

The browser rendered the built homepage and sign-in route with CSP enabled.
This did not exercise a signed-in checkout, Google OAuth completion, external
message delivery, or an actual public signing transaction.

## Remaining launch decisions

1. Deploy the verified code and recheck headers, OAuth, embeds, and downloads on
   the production origins. Railway currently does not wait for GitHub CI.
2. Assign and activate the missing worker cadences after reviewing provider
   configuration and message-delivery authorization. Empty queues do not prove
   future delivery behavior or cross-instance safety.
3. Complete controlled end-to-end customer/provider canaries and load testing.
4. Plan TipTap and Vitest upgrades, administrator MFA, and incident/log-retention work.
5. Before horizontal scaling, replace in-memory rate-limit stores and review
   shared worker ownership. Review Railway's announced Config-as-Code retirement
   before 2026-12-01; current deployment files still work now.
6. Backup/recovery remains explicitly deferred, not verified.
