# Content security policy and response headers

Updated: 2026-09-11. These are the implementation rules in the launch-hardening change; deployment must be verified separately.

## Frontend

frontend/scripts/security-headers.mjs builds the CSP for the static app server. The policy is an HTTP response header on HTML, assets, and error responses. Hashes authorize the exact inline boot script from the built index.html. Inline event handlers and eval are not allowed. The font stylesheet's load handler is registered by the hashed boot script.

The policy permits the application API and WebSocket origin, Google sign-in, Google Fonts, Stripe, and regional Sentry ingestion. User images/media can use HTTPS and blob URLs; editor previews can frame HTTPS content and PDF blobs. Inline styles remain allowed because the editor and UI use them. The app shell cannot itself be framed, and object embedding is disabled.

Changing integration origins requires reviewing security-headers.mjs and verifying the corresponding browser flow. A hash generated from the built shell avoids maintaining a stale handwritten hash.

The static server also adds nosniff, DENY framing, strict-origin-when-cross-origin referrer policy, and same-origin-allow-popups opener policy. HSTS applies only in production and does not preload or include all subdomains.

## API

backend/src/configure-app.ts installs Helmet before parsers, CORS, and routes. Cross-origin resource policy permits the existing public widgets and downloads; CORS still determines which callers can read authenticated responses. Opener policy preserves popup integrations.

There is no blanket API CSP: HTML and PDF controllers own their content policies, including restrictive sandbox policies on PDFs. API headers cannot enforce policy on the separately hosted frontend.

## Verification

Run npm run test:frontend (including scripts/security-headers.test.mjs) and the backend foundation tests. Verify the production build, hashed boot script, fonts, sign-in, API requests, public embeds, and PDF previews in a browser.

Use curl -I on the homepage, an asset, an error path, and /health. Confirm CSP is on the frontend and that intended public widget CORS behavior remains intact. Distinguish code-level checks from deployed response checks.
