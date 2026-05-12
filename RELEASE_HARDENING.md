# Release hardening guardrails

Use this checklist when shipping Itemize backend and frontend (for example Railway + Vite build).

## Deployment safety

- Ship hardening-related changes in small commits and smoke-test auth after each production deploy.
- Keep your documented production deploy path (for example Railway Nixpacks) consistent between releases.
- Do not disable Stripe or Twilio webhook verification in production; the server refuses to start if `STRIPE_WEBHOOK_SKIP_VERIFY` or `SKIP_TWILIO_WEBHOOK_VALIDATION` is set when `NODE_ENV=production`.

## Smoke checks after each deploy

- Backend `GET /api/health` returns healthy (database check passes after startup grace if applicable).
- Production app URL loads the SPA and login works for a known-good account.
- Dashboard or home-after-login loads without new console CORS or auth errors.
- At least one authenticated API call succeeds from the browser (for example user or organization fetch).
- If Stripe is live: billing webhook endpoint receives a test event or shows correct behavior in Stripe Dashboard logs.
- If Twilio SMS is live: inbound or status webhook URL matches the public HTTPS API URL Twilio validates against.

## Environment variables worth double-checking

**Backend**

- `NODE_ENV=production`
- `DATABASE_URL`
- `FRONTEND_URL` (canonical HTTPS app URL; not localhost)
- `JWT_SECRET` (32+ characters, unique from non-prod)
- `EXTRA_CORS_ORIGINS` if the browser app is served from additional origins (staging, preview)
- `SENTRY_DSN` for backend error tracking
- `STRIPE_WEBHOOK_SECRET` whenever `STRIPE_SECRET_KEY` is set
- Twilio webhook URLs point at the deployed API hostname

**Frontend**

- `VITE_API_URL` (public HTTPS API base URL)
- `VITE_SENTRY_DSN` for browser error tracking (optional but recommended in production)
