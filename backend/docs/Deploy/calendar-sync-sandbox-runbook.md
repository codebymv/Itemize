# Calendar sync sandbox rehearsal

This gate is staging-only. It proves the retained Google OAuth protocol, GraphQL connection management, the durable sync worker, and flag-off rollback without enabling provider traffic in production.

## Current staging state

As of 2026-07-18, the staging backend has no Google OAuth client, calendar token keyring, calendar redirect URI, or calendar worker flag. The worker is therefore disabled. Do not copy production Google credentials into staging; create a restricted Google OAuth web client and sandbox account.

Register this exact authorized redirect URI on the staging OAuth client:

```text
https://itemizecloud-backend-staging.up.railway.app/api/calendar-integrations/google/callback
```

Set these variables only on the `staging` environment and `itemize.cloud Backend` service:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `CALENDAR_TOKEN_ACTIVE_KEY_ID`
- `CALENDAR_TOKEN_ENCRYPTION_KEYS`
- `CALENDAR_SYNC_JOBS_ENABLED=false`

Use `railway variable set NAME --stdin --skip-deploys` for secrets so their values do not enter shell history. Generate a new staging-only 32-byte key; do not reuse the vault key or a production calendar key. After all variables are present, deploy once and verify `/api/health` before beginning OAuth.

## Rehearsal

1. Keep `CALENDAR_SYNC_JOBS_ENABLED=false`. Use a disposable Itemize account and organization, connect the sandbox Google account through the real browser flow, and verify the callback returns to staging.
2. Enable `VITE_CALENDAR_INTEGRATIONS_GRAPHQL` only in the local staging browser harness. Verify connection list, calendar selection, direction changes, enqueue, and status use GraphQL while OAuth initiation/callback and live provider-calendar discovery remain HTTP.
3. Create one future Itemize booking. Set direction to `push`, enqueue once, then enable the worker on one backend replica. Verify one deterministic Google event, a succeeded job, and no duplicate after replaying the same request key.
4. Create one non-Itemize Google event in the selected calendar. Set direction to `pull`, enqueue, and verify the normalized busy interval suppresses the corresponding public slot. Remove the Google event, repeat, and verify the stale busy interval is removed.
5. Set direction to `both`, change the Itemize booking, and create another external event. Verify one job records successful push and pull results.
6. Exercise the Google test project's constrained quota or an approved provider fault proxy. Verify the job enters `retry`, the stored/operator-visible error is redacted, and a later attempt succeeds without a duplicate remote event. Do not generate uncontrolled provider traffic.
7. Revoke the sandbox account's Google grant. Verify the bounded attempts end in `dead_letter`, credentials never appear in logs or GraphQL, and reconnecting creates a usable encrypted token generation.
8. Disable only `VITE_CALENDAR_INTEGRATIONS_GRAPHQL`. With the same session and rows, verify connection settings, enqueue, and status through retained REST without data repair.
9. Set `CALENDAR_SYNC_JOBS_ENABLED=false`, wait for zero `processing` jobs, and capture the connection/job/event/busy-interval counts plus relevant request IDs and deployment IDs.

## Cleanup

Delete the disposable Itemize organization and its calendar connection before removing the staging keyring. Revoke the sandbox Google grant, remove the temporary Google variables, redeploy with the worker disabled, and verify no queued, retrying, or processing calendar jobs remain. Keep only redacted evidence; never store OAuth codes, access tokens, refresh tokens, or encryption keys in the evidence file.

The gate passes only when push, pull, both, provider retry, revocation/dead-letter, GraphQL operation selection, and REST rollback all succeed and cleanup leaves no fixture rows.
