# Itemize.cloud API CORS Configuration

## Overview

The Itemize.cloud API uses CORS to control which domains can access the API. By default, the API only allows requests from the Itemize.cloud frontend.

## Allowed Origins

The legacy and NestJS APIs allow the canonical `FRONTEND_URL`, fixed Itemize production origins, and comma-separated `EXTRA_CORS_ORIGINS`. Local Vite origins are allowed only outside production. Typical origins are:

*   `https://itemize.cloud`
*   `http://localhost:5173` in development

The NestJS GraphQL service uses exact origin equality. It does not use a wildcard because browser requests include the authentication cookie.

During side-by-side migration, the preferred browser topology is the established legacy API origin: the browser posts to its `/graphql` endpoint, and the legacy service forwards the request to NestJS over the private service network. This preserves the host-bound authentication cookie without widening its domain. Configure `GRAPHQL_UPSTREAM_URL` and `GRAPHQL_UPSTREAM_TIMEOUT_MS` on the legacy service; point `VITE_GRAPHQL_URL` at the same public API origin. A separate public GraphQL hostname requires an explicit cookie-domain and CSRF design before browser use.

The retained contact transfer routes use the same topology. `CONTACT_TRANSFERS_NESTJS_ENABLED=true` proxies only `GET /api/contacts/export/csv` and `POST /api/contacts/import/csv` to the NestJS service identified by `GRAPHQL_UPSTREAM_URL`; false or unset leaves both routes on the legacy implementation. `CONTACT_TRANSFERS_UPSTREAM_TIMEOUT_MS` defaults to 30 seconds. The proxy forwards only the host cookie, organization, CSRF, and request-ID headers and returns only the required download/content/request headers.

Invoice PDF delivery uses the same private upstream and stable public URL. `INVOICE_PDF_NESTJS_ENABLED=true` proxies only `GET /api/invoices/:id/pdf` to NestJS; false or unset falls through to the legacy Express route. `INVOICE_PDF_UPSTREAM_TIMEOUT_MS` defaults to 60 seconds. The proxy forwards only the host cookie, selected organization, and request ID and returns only the hardened PDF download and request headers.

The Stripe invoice webhook also keeps its existing public URL. `STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED=true` proxies only `POST /api/invoices/webhook/stripe` to the private NestJS service; false or unset falls through to Express. `STRIPE_INVOICE_WEBHOOK_UPSTREAM_TIMEOUT_MS` defaults to 30 seconds. The proxy never reserializes JSON: it forwards the captured body bytes plus only `Content-Type`, `Stripe-Signature`, and request ID, and it returns only content type, cache control, and request ID. Cookies, authorization, organization, and CSRF headers are not forwarded to this provider-authenticated endpoint.

Invoice logo uploads keep their two existing public URLs. `INVOICE_LOGO_UPLOADS_NESTJS_ENABLED=true` proxies only `POST /api/invoices/businesses/:id/logo` and `POST /api/invoices/settings/logo`; false or unset falls through to Express. `INVOICE_LOGO_UPLOADS_UPSTREAM_TIMEOUT_MS` defaults to 30 seconds. The proxy caps and preserves the multipart bytes and boundary, forwards only the host cookie, selected organization, CSRF token, and request ID, and returns only content type, cache control, and request ID.

Authenticated signature files keep their five existing public URLs. `SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED=true` proxies only the document and template multipart uploads; false or unset falls through to Express. `SIGNATURE_FILE_READS_NESTJS_ENABLED=true` independently proxies the document source, completed-document download, and template source; false or unset falls through to Express. Upload and read timeouts default to 30 and 60 seconds through `SIGNATURE_FILE_UPLOADS_UPSTREAM_TIMEOUT_MS` and `SIGNATURE_FILE_READS_UPSTREAM_TIMEOUT_MS`. Upload forwarding is bounded to 5 MiB plus multipart overhead and carries only the host cookie, selected organization, CSRF token, request ID, and exact content type. Read forwarding carries only the cookie, selected organization, request ID, and PDF accept header, and returns only the hardened private delivery headers.

Public signing keeps its six capability-bearing URLs and never forwards authentication cookies, organization selection, authorization, or CSRF. `PUBLIC_SIGNING_READS_NESTJS_ENABLED=true` proxies session open plus inline/attachment PDF reads; `PUBLIC_SIGNING_MUTATIONS_NESTJS_ENABLED=true` independently proxies verification refusal, submit, and decline. False or unset falls through to Express. Read and mutation timeouts default to 60 and 30 seconds through `PUBLIC_SIGNING_READS_UPSTREAM_TIMEOUT_MS` and `PUBLIC_SIGNING_MUTATIONS_UPSTREAM_TIMEOUT_MS`. Requests forward only bounded IP/user-agent/request correlation evidence; JSON responses are capped at 2 MiB and PDF responses at 25 MiB. Response forwarding is restricted to private cache, content/disposition/length, sandbox CSP, no-referrer, request ID, and noindex/nosniff headers.

## Allowed Methods

The following methods are allowed to be used with the API:

*   `GET`
*   `POST`
*   `PUT`
*   `DELETE`
*   `PATCH`
*   `OPTIONS`

## Allowed Headers

The following headers are allowed to be used with the API:

*   `Content-Type`
*   `Authorization`
*   `X-Organization-Id`
*   `X-Request-Id`
*   `X-CSRF-Token` on the legacy API
