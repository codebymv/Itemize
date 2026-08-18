# Production Postgres restore drill

Perform this drill against a **copy** of production, never against the live primary, unless you are executing a real incident restore. Last planned drill: 18 Aug 2026.

## Goal

Prove we can restore Railway Postgres to a known point and that Express/Nest can boot against the restored data (`schema_migrations` includes `053_chat_widget_graphql`).

## Prerequisites

- Railway project access for `itemize-backend-production-92ad` and its Postgres plugin
- `DATABASE_URL` for a **drill** environment (new Postgres service or restored snapshot)
- `backend/scripts/run-migrations.js` from this repo

## Drill

1. In Railway, open the production Postgres service → **Backups**.
2. Create or confirm a recent backup (automatic daily snapshot is enough if one exists).
3. Restore that backup into a **new** Postgres service named `itemize-postgres-restore-drill`.
4. Attach the drill database to a disposable backend service, or run locally:

   ```bash
   set DATABASE_URL=<drill postgres url>
   node backend/scripts/run-migrations.js --status
   ```

5. Confirm `053_chat_widget_graphql` is present in `schema_migrations`. If the snapshot predates current head, run:

   ```bash
   node backend/scripts/run-migrations.js
   ```

6. Point a throwaway Express instance at the drill URL and check:

   - `GET /api/health` → `healthy` after the startup grace window
   - `POST /graphql` accepts a simple authenticated query
   - One workspace note and one whiteboard still load

7. Delete the drill Postgres service when finished. Do **not** leave the restored copy publicly reachable.

## Incident restore (live)

Only if production data is lost or corrupted:

1. Put the Express service in maintenance (or let boot hardening fail health until the DB is ready).
2. Restore the chosen backup over the production volume using Railway's restore action.
3. Run `node backend/scripts/run-migrations.js --status` and apply any missing migrations.
4. Redeploy Express. Confirm `/api/health` and `/api/signatures/documents/:id/file`.
5. Record the backup timestamp, restore time, and verification in the incident notes.

Signature delivery, workflow, and calendar-sync workers stay off unless a separate incident requires them.
