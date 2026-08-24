# Itemize.cloud API Authentication

## Overview

The Itemize.cloud API uses JWT-based authentication to protect your data. All requests to the API must be authenticated with a valid JWT.

## Generating a JWT

To generate a JWT, you will need to make a POST request to the `/auth/login` endpoint with your email and password.

```
POST /auth/login
{
  "email": "user@example.com",
  "password": "password"
}
```

If your credentials are valid, the API will return a JWT.

```
{
  "token": "..."
}
```

## Authenticating Requests

To authenticate your requests, you will need to include the JWT in the `Authorization` header of your requests.

```
Authorization: Bearer ...
```

## Token Expiration

JWTs expire after 24 hours. To get a new JWT, you will need to make a POST request to the `/auth/refresh` endpoint with your expired JWT.

```
POST /auth/refresh
{
  "token": "..."
}
```

If your JWT is valid, the API will return a new JWT.

```
{
  "token": "..."
}
```
