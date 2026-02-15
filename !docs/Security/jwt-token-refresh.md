# JWT Token Refresh Strategy

## Overview

This document explains how Itemize handles JWT token expiration using enterprise-grade patterns.

## The Problem

JWT access tokens expire after 15 minutes for security. When users stay on the app longer than this, API requests fail with 401 errors, causing:
- Failed data fetches
- WebSocket disconnections
- Poor user experience
- Forced logouts

## Enterprise Solution

### 1. **Dual Token System**
- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (30 days), used to get new access tokens

### 2. **Automatic Token Refresh**

When a request receives a 401 error, the API interceptor:
1. **Pauses all outgoing requests**
2. **Attempts to refresh** the access token using the refresh token
3. **Retries failed requests** with the new token
4. **Queues concurrent requests** to prevent multiple refresh calls

```typescript
// Location: frontend/src/lib/api.ts

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Attempt token refresh
      const newToken = await refreshToken();
      // Retry original request
      return api(originalConfig);
    }
  }
);
```

### 3. **Request Queuing**

Multiple failing requests are queued during refresh:

```typescript
let isRefreshing = false;
let failedQueue = [];

if (isRefreshing) {
  // Queue this request
  return new Promise((resolve, reject) => {
    failedQueue.push({ resolve, reject });
  });
}
```

### 4. **WebSocket Reconnection**

WebSocket connections also use JWT tokens. When a token refreshes:

```typescript
// Location: frontend/src/pages/canvas.tsx

window.addEventListener('auth:token-refreshed', (event) => {
  const newToken = event.detail.token;
  
  // Reconnect WebSocket with new token
  socket.disconnect();
  socket.auth = { token: newToken };
  socket.connect();
});
```

### 5. **Graceful Session Expiration**

If refresh token expires (after 30 days of inactivity):
1. **Clear all auth data**
2. **Show user-friendly notification**
3. **Redirect to login** with context
4. **Preserve intended destination**

```typescript
// Show toast notification
window.dispatchEvent(new CustomEvent('auth:session-expired'));

// Redirect after delay
setTimeout(() => {
  window.location.href = '/login?session=expired';
}, 2000);
```

### 6. **Infinite Loop Protection**

Prevents infinite refresh attempts:

```typescript
let refreshAttempts = 0;
const MAX_REFRESH_ATTEMPTS = 3;

if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
  // Force logout
  clearAuthAndRedirect();
}
```

## User Experience Flow

### Scenario 1: Token Expires (User Still Active)
1. User action triggers API request
2. Request fails with 401
3. **Silent token refresh** happens in background
4. Request automatically retries
5. User sees no interruption ✅

### Scenario 2: Refresh Token Expires (Inactive 30+ Days)
1. Token refresh attempt fails
2. **Toast notification** shows: "Session Expired"
3. Wait 2 seconds for user to see message
4. Redirect to `/login?session=expired`
5. Login page shows alert explaining why ✅

### Scenario 3: WebSocket Disconnection
1. WebSocket gets "jwt expired" error
2. API interceptor refreshes token
3. Custom event `auth:token-refreshed` fires
4. WebSocket reconnects with new token
5. Real-time updates continue ✅

## Implementation Details

### Files Modified

1. **`frontend/src/lib/api.ts`**
   - Enhanced 401 interceptor
   - Added request queuing
   - Added loop prevention
   - Added custom events

2. **`frontend/src/pages/canvas.tsx`**
   - Added WebSocket token refresh listener
   - Added error handling for jwt expiration
   - Added automatic reconnection

3. **`frontend/src/pages/Login.tsx`**
   - Added session expiration detection
   - Added alert banner for expired sessions

4. **`frontend/src/App.tsx`**
   - Added session expiration hook
   - Fixed BrowserRouter context issue

5. **`frontend/src/hooks/useSessionExpiration.ts`** (New)
   - Session expiration notification hook
   - Token refresh event listener

### Backend Support

The backend already implements the dual token system:

```javascript
// Location: backend/src/auth.js

// Access token: 15 minutes
const ACCESS_TOKEN_EXPIRY = '15m';

// Refresh token: 30 days
const REFRESH_TOKEN_EXPIRY = '30d';

// Refresh endpoint
router.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.itemize_refresh;
  // Validate refresh token
  // Generate new access token
  // Return new token
});
```

## Comparison with Other Approaches

### ❌ **Approach 1: Immediate Logout**
```typescript
if (response.status === 401) {
  logout();
  redirect('/login');
}
```
**Problems:**
- Poor UX - forces logout on every expiration
- Loses user's work
- Doesn't distinguish between token expiry and actual auth failure

### ❌ **Approach 2: Long-Lived Tokens**
```typescript
const TOKEN_EXPIRY = '30d'; // Single token, 30 days
```
**Problems:**
- Security risk if token is stolen
- Can't revoke access without forcing all users to re-login
- Doesn't follow OAuth2 best practices

### ✅ **Approach 3: Token Refresh (Our Implementation)**
```typescript
// Short access token + Long refresh token
// Automatic refresh on 401
// Graceful fallback
```
**Benefits:**
- ✅ Secure (short-lived access tokens)
- ✅ User-friendly (silent refresh)
- ✅ Follows OAuth2 standards
- ✅ Granular control

## Testing the Implementation

### Test 1: Token Expiration
1. Login to the app
2. Wait 16 minutes (past 15-minute access token expiry)
3. Perform an action (create list, fetch data)
4. **Expected**: Action succeeds with silent token refresh

### Test 2: Refresh Token Expiration
1. Login to the app
2. Manually clear the refresh cookie: `document.cookie = 'itemize_refresh=; Max-Age=0'`
3. Perform an action
4. **Expected**: Toast notification + redirect to login

### Test 3: WebSocket Reconnection
1. Login and go to canvas page
2. Wait 16 minutes
3. Check browser console for "Token refreshed, reconnecting WebSocket"
4. **Expected**: WebSocket reconnects automatically

## Configuration

### Adjust Token Lifetimes

In `backend/src/auth.js`:

```javascript
// Make access tokens last longer (less secure, fewer refreshes)
const ACCESS_TOKEN_EXPIRY = '1h'; // Instead of '15m'

// Make refresh tokens last longer (longer sessions)
const REFRESH_TOKEN_EXPIRY = '90d'; // Instead of '30d'
```

### Adjust Refresh Retry Limits

In `frontend/src/lib/api.ts`:

```typescript
// Allow more refresh attempts before forcing logout
const MAX_REFRESH_ATTEMPTS = 5; // Instead of 3
```

## Security Considerations

1. **Refresh tokens are httpOnly cookies** - Protected from XSS
2. **Access tokens are in localStorage** - Needed for WebSocket auth
3. **Refresh tokens can't be accessed by JavaScript** - Secure
4. **Short access token lifetime** - Limits damage if stolen
5. **Refresh tokens rotate** - New refresh token on each refresh

## Monitoring

Add logging to track token refresh rates:

```typescript
// In api.ts
console.log('[Auth Metrics]', {
  refreshAttempts,
  lastRefresh: Date.now(),
  userAgent: navigator.userAgent
});
```

## Future Enhancements

1. **Token Refresh Warning**: Show banner 2 minutes before session expires
2. **Remember Me**: Extend refresh token to 90 days if checked
3. **Multi-Device Management**: List active sessions, allow remote logout
4. **Refresh Token Rotation**: Issue new refresh token on each use
5. **Rate Limiting**: Prevent token refresh abuse

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Token Storage Guide](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
