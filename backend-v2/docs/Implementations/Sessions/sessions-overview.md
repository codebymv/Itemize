# Itemize.cloud Sessions Implementation Overview

## Introduction

Itemize.cloud implements a stateless session management system using JSON Web Tokens (JWTs) for authenticating users. This approach provides scalability and simplifies session handling by avoiding server-side session storage.

## Session Architecture

```mermaid
graph TD
    A[User Login (Frontend)] --> B[Backend API (/api/auth/google-login)]
    B --> C[Generate JWT (Access & Refresh Tokens)]
    C --> A
    A -- Store Tokens (Frontend) --> D[Local Storage]
    A -- Include Access Token in Requests --> E[Protected Backend API Endpoints]
    E -- Verify Access Token --> B
```

## JWT-Based Session Management

### Token Generation

Upon successful authentication (e.g., via Google OAuth), the backend generates two types of JWTs:

1.  **Access Token**:
    *   **Purpose**: Used to authenticate requests to protected API endpoints.
    *   **Expiry**: Short-lived (e.g., 7 days).
    *   **Contents**: Contains user identification (e.g., `userId`, `email`, `name`).

2.  **Refresh Token**:
    *   **Purpose**: Used to obtain a new access token when the current one expires, without requiring the user to re-authenticate.
    *   **Expiry**: Longer-lived (e.g., 30 days).

**Backend Code Snippet (`backend/src/auth.js`):**

```javascript
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};
```

### Token Storage (Frontend)

Access and refresh tokens are typically stored in the frontend's local storage or session storage. For enhanced security, especially for refresh tokens, `HttpOnly` cookies are often recommended in production environments to mitigate XSS risks.

### Authentication Middleware

All protected API routes utilize an authentication middleware (`authenticateJWT`) to verify the validity of the access token provided in the `Authorization` header of incoming requests.

**Backend Code Snippet (`backend/src/auth.js`):**

```javascript
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403); // Forbidden (invalid or expired token)
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401); // Unauthorized (no token provided)
  }
};
```

### Token Refresh Mechanism

When an access token expires, the frontend can use the refresh token to request a new access token from a dedicated refresh endpoint (`/api/auth/refresh`). This allows for continuous user sessions without frequent re-logins.

### Logout Process

Since JWTs are stateless, the logout process primarily involves the frontend discarding the stored access and refresh tokens. There is no server-side session invalidation required for JWTs themselves, though any associated refresh tokens might be blacklisted or revoked if a more robust logout is needed.

**Backend Code Snippet (`backend/src/auth.js`):**

```javascript
router.post('/logout', (req, res) => {
  // We don't need to do much here since we're using stateless JWT
  // The frontend will remove the token from storage
  res.status(200).json({ message: 'Logged out successfully' });
});
```

## Security Considerations

-   **JWT Secret**: The `JWT_SECRET` must be a strong, randomly generated key and stored securely as an environment variable, never committed to source control.
-   **HTTPS Enforcement**: All API communication must occur over HTTPS to prevent tokens from being intercepted in transit.
-   **Token Expiration**: Short-lived access tokens minimize the window of opportunity for token compromise.
-   **Refresh Token Security**: If refresh tokens are used, consider storing them in `HttpOnly` cookies to prevent client-side JavaScript access.
-   **Statelessness**: While beneficial for scalability, stateless JWTs mean that a compromised access token remains valid until its expiration unless a revocation mechanism (e.g., a blacklist) is implemented.

## Future Enhancements

-   **Refresh Token Rotation**: Implement a mechanism where a new refresh token is issued with each access token refresh, and the old refresh token is immediately invalidated.
-   **Token Revocation**: Implement a server-side blacklist for compromised or explicitly revoked access/refresh tokens.
-   **Session Monitoring**: Track active sessions and provide users with the ability to view and revoke their active sessions from different devices.
