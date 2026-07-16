# Itemize.cloud API CORS Configuration

## Overview

The Itemize.cloud API uses CORS to control which domains can access the API. By default, the API only allows requests from the Itemize.cloud frontend.

## Allowed Origins

The legacy and NestJS APIs allow the canonical `FRONTEND_URL`, fixed Itemize production origins, and comma-separated `EXTRA_CORS_ORIGINS`. Local Vite origins are allowed only outside production. Typical origins are:

*   `https://itemize.cloud`
*   `http://localhost:5173` in development

The NestJS GraphQL service uses exact origin equality. It does not use a wildcard because browser requests include the authentication cookie. Set the frontend's full endpoint with `VITE_GRAPHQL_URL` when GraphQL is hosted separately.

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
