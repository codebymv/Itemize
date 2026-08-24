const { createOAuthRouteProxy } = require('./oauth-proxy-core');

const socialOAuthEnabled = (environment = process.env) =>
    environment.SOCIAL_OAUTH_NESTJS_ENABLED === 'true';

const stripeConnectEnabled = (environment = process.env) =>
    environment.STRIPE_CONNECT_NESTJS_ENABLED === 'true';

const createSocialOAuthProxies = ({ environment = process.env, fetchImpl, logger } = {}) => {
    const enabled = socialOAuthEnabled(environment);
    const shared = {
        enabled,
        environment,
        fetchImpl,
        logger,
        eventName: 'social_oauth_proxy_failed',
        unavailableMessage: 'Social integration service is unavailable',
    };
    return {
        connect: createOAuthRouteProxy({
            ...shared,
            path: '/api/social/connect/facebook',
            forwardSession: true,
        }),
        callback: createOAuthRouteProxy({
            ...shared,
            path: '/api/social/callback/facebook',
            queryParams: ['code', 'state', 'error', 'error_description'],
        }),
    };
};

const createStripeConnectProxies = ({ environment = process.env, fetchImpl, logger } = {}) => {
    const enabled = stripeConnectEnabled(environment);
    const shared = {
        enabled,
        environment,
        fetchImpl,
        logger,
        eventName: 'stripe_connect_proxy_failed',
        unavailableMessage: 'Stripe integration service is unavailable',
    };
    return {
        connect: createOAuthRouteProxy({
            ...shared,
            path: '/api/invoice-integrations/stripe/connect',
            queryParams: ['return_url'],
            forwardSession: true,
        }),
        callback: createOAuthRouteProxy({
            ...shared,
            path: '/api/invoice-integrations/stripe/callback',
            queryParams: ['code', 'state', 'error', 'error_description'],
        }),
        disconnect: createOAuthRouteProxy({
            ...shared,
            path: '/api/invoice-integrations/stripe/disconnect',
            forwardSession: true,
            method: 'POST',
        }),
    };
};

module.exports = {
    createSocialOAuthProxies,
    createStripeConnectProxies,
    socialOAuthEnabled,
    stripeConnectEnabled,
};
