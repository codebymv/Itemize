# Synthetic browser rehearsal

This dedicated Vite fixture imports the production Login, ProtectedRoute, ClientFollowUpsPage, ClientTasksPanel and GraphQL transport. Identity, Google integration and the surrounding application shell are synthetic. Playwright supplies task/CSRF/session-refresh responses and blocks requests outside `http://127.0.0.1:5197`. It is not a deployed-app or real OAuth test.

The fixture config disables dotenv loading and is separate from the production entry point. Do not serve this fixture publicly. No customer data or real credentials are needed.

From `frontend`, start `npx vite --config pilot/vite.config.mts` in a sanitized environment (no inherited VITE service credentials). In another terminal run `node pilot/browser.mjs` with:

- `PILOT_PLAYWRIGHT_MODULE`: absolute path to an installed `playwright-core/index.mjs` (optional if the package is resolvable normally).
- `PILOT_CHROMIUM`: optional absolute path to a Chromium executable; otherwise Playwright's installed browser is used.
- `PILOT_OUTPUT`: disposable directory for screenshots.

The September 15, 2026 run used Playwright Core 1.63.0 and locally installed Chromium revision 1208. Both 1280×900 desktop and 390×844 mobile scenarios passed. Each checks signed-out task navigation, login-page reload, retained task/organization/hash, no task query before organization selection, CSRF and organization headers, long-title wrapping, completion with a dropped response and identical replay key, reopening and expired-session return navigation. It asserts exactly two applied transitions and no duplicate effect or uncaught page error. Identity establishment is simulated; password/Google routing also has component tests.

Use the backend cross-service acceptance test separately for real pairing, delivery/receipt reconciliation, notification ownership, task completion/reopening, revocation and tombstones against disposable databases. The browser fixture does not prove database authorization or real service availability.
