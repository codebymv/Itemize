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
