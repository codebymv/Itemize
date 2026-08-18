const crypto = require('crypto');

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_RETURN_PATH = '/payment-settings';

function getSecret() {
    const secret = process.env.STRIPE_CONNECT_STATE_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('Stripe Connect state secret is not configured');
    return secret;
}

function normalizeReturnPath(value) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
        return DEFAULT_RETURN_PATH;
    }
    if (value.includes('\\') || [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    })) {
        return DEFAULT_RETURN_PATH;
    }
    return value;
}

function signatureFor(payload, secret = getSecret()) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createStripeConnectState({ userId, organizationId, returnUrl }, options = {}) {
    const stateData = {
        userId: Number(userId),
        organizationId: Number(organizationId),
        returnPath: normalizeReturnPath(returnUrl),
        issuedAt: options.now ?? Date.now(),
        nonce: crypto.randomBytes(16).toString('base64url'),
    };
    const payload = Buffer.from(JSON.stringify(stateData)).toString('base64url');
    return `${payload}.${signatureFor(payload, options.secret)}`;
}

function verifyStripeConnectState(state, options = {}) {
    if (typeof state !== 'string') throw new Error('Invalid OAuth state');
    const [payload, suppliedSignature, extra] = state.split('.');
    if (!payload || !suppliedSignature || extra !== undefined) throw new Error('Invalid OAuth state');

    const expected = Buffer.from(signatureFor(payload, options.secret));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
        throw new Error('Invalid OAuth state signature');
    }

    let stateData;
    try {
        stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        throw new Error('Invalid OAuth state payload');
    }

    const now = options.now ?? Date.now();
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    if (!Number.isInteger(stateData.userId) || !Number.isInteger(stateData.organizationId)
        || typeof stateData.issuedAt !== 'number' || typeof stateData.nonce !== 'string'
        || stateData.issuedAt > now + 30_000 || now - stateData.issuedAt > maxAgeMs) {
        throw new Error('Expired or invalid OAuth state');
    }

    return {
        userId: stateData.userId,
        organizationId: stateData.organizationId,
        returnPath: normalizeReturnPath(stateData.returnPath),
    };
}

module.exports = {
    createStripeConnectState,
    verifyStripeConnectState,
    normalizeReturnPath,
    DEFAULT_MAX_AGE_MS,
    DEFAULT_RETURN_PATH,
};
