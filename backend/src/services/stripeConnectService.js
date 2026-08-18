const { logger } = require('../utils/logger');

const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

function getConnectRedirectUri() {
    const configured = process.env.STRIPE_CONNECT_REDIRECT_URI?.trim();
    if (!configured) {
        return process.env.NODE_ENV === 'production'
            ? 'https://api.itemize.cloud/api/invoice-integrations/stripe/callback'
            : 'http://localhost:3001/api/invoice-integrations/stripe/callback';
    }

    let parsed;
    try {
        parsed = new URL(configured);
    } catch {
        throw new Error('STRIPE_CONNECT_REDIRECT_URI must be an absolute HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.hash
        || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
        throw new Error(
            'STRIPE_CONNECT_REDIRECT_URI must be a credential-free HTTPS URL in production'
        );
    }
    return configured;
}

function assertConnectConfigured() {
    if (!process.env.STRIPE_CLIENT_ID?.trim() || !process.env.STRIPE_SECRET_KEY?.trim()) {
        throw new Error('Stripe Connect is not configured');
    }
}

function getAuthUrl(state) {
    assertConnectConfigured();
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.STRIPE_CLIENT_ID.trim(),
        scope: 'read_write',
        state,
        redirect_uri: getConnectRedirectUri(),
    });
    return `https://connect.stripe.com/oauth/authorize?${params}`;
}

async function exchangeCodeForAccount(code) {
    assertConnectConfigured();
    const form = new URLSearchParams({
        client_secret: process.env.STRIPE_SECRET_KEY.trim(),
        code: String(code),
        grant_type: 'authorization_code',
    });
    const response = await fetch('https://connect.stripe.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    const accountId = String(body.stripe_user_id || '').trim();
    if (!response.ok || body.error || !STRIPE_ACCOUNT_ID.test(accountId)) {
        logger.error('Stripe Connect token exchange failed', {
            status: response.status,
            error: body.error || body.error_description || 'invalid_account',
        });
        throw new Error('Stripe Connect token exchange failed');
    }
    return {
        stripeAccountId: accountId,
        stripePublishableKey: typeof body.stripe_publishable_key === 'string'
            ? body.stripe_publishable_key
            : null,
    };
}

async function deauthorizeAccount(stripeAccountId) {
    if (!STRIPE_ACCOUNT_ID.test(String(stripeAccountId || ''))) return;
    if (!process.env.STRIPE_CLIENT_ID?.trim() || !process.env.STRIPE_SECRET_KEY?.trim()) return;
    const form = new URLSearchParams({
        client_id: process.env.STRIPE_CLIENT_ID.trim(),
        stripe_user_id: stripeAccountId,
    });
    const response = await fetch('https://connect.stripe.com/oauth/deauthorize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY.trim()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = String(body.error_description || body.error || '');
        if (!/already been deauthorized|no such/i.test(message)) {
            logger.warn('Stripe Connect deauthorize did not succeed', {
                status: response.status,
            });
        }
    }
}

function isStripeAccountId(value) {
    return STRIPE_ACCOUNT_ID.test(String(value || ''));
}

module.exports = {
    getAuthUrl,
    getConnectRedirectUri,
    exchangeCodeForAccount,
    deauthorizeAccount,
    isStripeAccountId,
    STRIPE_ACCOUNT_ID,
};
