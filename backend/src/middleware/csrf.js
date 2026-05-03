/**
 * CSRF Protection Middleware
 * Protects state-changing operations from Cross-Site Request Forgery attacks
 */

const crypto = require('crypto');

const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';

// Token cache per session (alternatively, use Redis for distributed systems)
const tokenStore = new Map();

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken() {
    return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('base64url');
}

/**
 * Hash a token for comparison (prevents timing attacks)
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * CSRF middleware for Express
 * 
 * Usage:
 *   app.use(csrfProtection); // Apply globally
 *   // Or selectively:
 *   app.post('/api/sensitive', csrfProtection, handler);
 */
function csrfProtection(req, res, next) {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip CSRF for webhook endpoints (they verify signatures)
    const webhookPaths = [
        '/api/billing/webhook',
        '/api/webhooks/',
        '/api/chat-widget/incoming',
        '/api/social/webhook',
        '/api/sms-templates/webhook',
    ];
    
    if (webhookPaths.some(path => req.path.startsWith(path))) {
        return next();
    }

    // Login, registration, password recovery, and OAuth callbacks establish
    // sessions. They are rate limited and do not rely on an existing session.
    const sessionBootstrapPaths = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/verify-email',
        '/api/auth/resend-verification',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/google-login',
        '/api/auth/google-credential',
    ];

    if (sessionBootstrapPaths.includes(req.path)) {
        return next();
    }

    // CSRF protects browser cookie-authenticated writes. Public endpoints
    // without an Itemize session cookie rely on their own token/signature model.
    if (!req.cookies?.itemize_auth && !req.cookies?.itemize_refresh) {
        return next();
    }

    // Skip for API key authenticated requests (not browser-based)
    if (req.headers['x-api-key'] && !req.headers['cookie']) {
        return next();
    }

    const token = req.headers[CSRF_HEADER_NAME] || req.body?._csrf;
    
    if (!token) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'CSRF token missing',
                code: 'CSRF_TOKEN_MISSING'
            }
        });
    }

    // Get token from cookie
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    
    if (!cookieToken) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'CSRF cookie missing',
                code: 'CSRF_COOKIE_MISSING'
            }
        });
    }

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
        Buffer.from(hashToken(token)),
        Buffer.from(hashToken(cookieToken))
    )) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'CSRF token mismatch',
                code: 'CSRF_TOKEN_MISMATCH'
            }
        });
    }

    next();
}

/**
 * Middleware to set CSRF token cookie for the first time
 * Call this on pages that need CSRF tokens
 */
function setCsrfToken(req, res, next) {
    const existingToken = req.cookies?.[CSRF_COOKIE_NAME];
    
    if (!existingToken) {
        const token = generateToken();
        res.cookie(CSRF_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        });
        
        // Also expose token to frontend via response header
        res.setHeader('X-CSRF-Token', token);
    }
    
    next();
}

function issueCsrfToken(req, res) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
    });
    res.setHeader('X-CSRF-Token', token);
    res.json({ success: true, csrfToken: token });
}

/**
 * Get CSRF token from request for client-side usage
 */
function getCsrfToken(req) {
    return req.cookies?.[CSRF_COOKIE_NAME] || null;
}

/**
 * Double-submit CSRF protection (for APIs without cookies)
 * Frontend must include CSRF token in both header and body/query
 */
function doubleSubmitCsrf(req, res, next) {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const headerToken = req.headers[CSRF_HEADER_NAME];
    const bodyToken = req.body?._csrf;
    const queryToken = req.query?._csrf;

    if (!headerToken) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'CSRF header token missing',
                code: 'CSRF_HEADER_MISSING'
            }
        });
    }

    // Verify header matches body or query
    const submittedToken = bodyToken || queryToken;
    
    if (!submittedToken || !crypto.timingSafeEqual(
        Buffer.from(headerToken),
        Buffer.from(submittedToken)
    )) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'CSRF tokens do not match',
                code: 'CSRF_MISMATCH'
            }
        });
    }

    next();
}

module.exports = {
    csrfProtection,
    setCsrfToken,
    getCsrfToken,
    doubleSubmitCsrf,
    issueCsrfToken,
    generateToken,
    CSRF_HEADER_NAME,
    CSRF_COOKIE_NAME,
};
