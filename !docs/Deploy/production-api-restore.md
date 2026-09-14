# Production API recovery

Updated September 14, 2026. The separate Express runtime was retired on August 24. Do not redeploy it, configure GRAPHQL_UPSTREAM_URL, or use the removed backend migration runner. Follow the [incident response procedure](incident-response.md).

1. Record the failing request, UTC time, affected service, running commit and Railway deployment ID. Inspect Nest startup errors and migration pre-deploy output. Keep secrets and customer payloads out of incident notes.
2. Check the active API environment against `backend/.env.example` and its startup ownership summary. Correct missing requirements; do not bypass startup validation.
3. Confirm the migration gate `npm --prefix /app/db run migrate` succeeded. Schema authority is `db/`. Investigate failed migrations before retrying; never run the test database initializer against production.
4. Redeploy the verified image, or select a known-good image after checking compatibility with the current schema. Code rollback does not reverse migrations, charges, messages or provider events.
5. Check API `/health`, frontend HTML and its current entry asset, then an authenticated read and one affected journey. Health alone is insufficient.
6. Inspect Admin Operations queue age, retries and jobs needing review. Preserve worker ownership; do not run one-shot jobs alongside continuous owners. Resume incident-paused owners deliberately after inspecting their backlogs.

Backup/PITR setup and restore drills remain deferred by the user. This runbook does not assert that a recoverable production snapshot exists.
