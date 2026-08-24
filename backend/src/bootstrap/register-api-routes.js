const vaultsRoutes = require('../routes/vaults.routes');
const { createContactTransferProxy } = require('../contact-transfer-proxy');
const emailWebhooksRoutes = require('../routes/email-webhooks.routes');
const smsWebhooksRoutes = require('../routes/sms-webhooks.routes');
const chatWidgetRoutes = require('../routes/chat-widget.routes');
const invoicesRoutes = require('../routes/invoices.routes');
const { createInvoicePdfProxy } = require('../invoice-pdf-proxy');
const { createInvoiceLogoUploadProxy } = require('../invoice-logo-upload-proxy');
const { createStripeInvoiceWebhookProxy } = require('../stripe-invoice-webhook-proxy');
const billingRoutes = require('../routes/billing.routes');
const reputationRoutes = require('../routes/reputation.routes');
const socialRoutes = require('../routes/social.routes');
const pagesRoutes = require('../routes/pages.routes');
const bookingsRoutes = require('../routes/bookings.routes');
const formsRoutes = require('../routes/forms.routes');
const {
    createSignatureFileReadProxy,
    createSignatureFileUploadProxy,
} = require('../signature-file-proxy');
const {
    createPublicSigningProxy,
    publicSigningMutationsEnabled,
    publicSigningReadsEnabled,
} = require('../public-signing-proxy');
const {
    createPublicEstimateProxy,
    publicEstimatesEnabled,
} = require('../public-estimate-proxy');
const {
    createPublicSharingProxy,
    publicSharingEnabled,
} = require('../public-sharing-proxy');
const {
    createPublicBookingsProxy,
    publicBookingsEnabled,
} = require('../public-bookings-proxy');
const {
    createPublicReputationProxy,
    publicReputationEnabled,
} = require('../public-reputation-proxy');
const {
    createPublicLandingPagesProxy,
    publicLandingPagesEnabled,
} = require('../public-landing-pages-proxy');
const {
    createPublicFormsProxy,
    publicFormsEnabled,
} = require('../public-forms-proxy');
const {
    createEmailWebhookProxy,
    emailWebhooksEnabled,
} = require('../email-webhooks-proxy');
const {
    createSmsWebhookProxy,
    smsWebhooksEnabled,
} = require('../sms-webhooks-proxy');
const {
    createWorkflowWebhookProxy,
    workflowWebhooksEnabled,
} = require('../workflow-webhooks-proxy');
const {
    createSubscriptionWebhookProxy,
    subscriptionWebhooksEnabled,
} = require('../subscription-webhooks-proxy');
const {
    createSocialWebhookProxy,
    socialWebhooksEnabled,
} = require('../social-webhooks-proxy');
const { createCalendarOAuthProxy } = require('../calendar-oauth-proxy');
const {
    createSocialOAuthProxies,
    createStripeConnectProxies,
} = require('../provider-oauth-proxies');
const express = require('express');
const rateLimit = require('express-rate-limit');
const webhooksRoutes = require('../routes/webhooks.routes');
const calendarIntegrationsRoutes = require('../routes/calendar-integrations.routes');
const invoiceIntegrationsRoutes = require('../routes/invoice-integrations.routes');
const sharingRoutes = require('../routes/sharing.routes');

function collectRoutes(stack, basePath = '') {
    const routes = [];
    for (const layer of stack) {
        if (layer.route && layer.route.path) {
            const routePath = layer.route.path;
            if (routePath && !routePath.includes('*') && !routePath.includes('/status')) {
                routes.push((basePath + routePath).replace(/\/:([^/]+)/g, '/:$1'));
            }
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            let mountPath = '';
            if (layer.regexp && layer.regexp.source) {
                const regexSource = layer.regexp.source;
                const match = regexSource.match(/^\^\\\/(.+?)(?:\\\?\\$)?$/);
                if (match) {
                    mountPath = '/' + match[1].replace(/\\\//g, '/');
                }
            }
            routes.push(...collectRoutes(layer.handle.stack, basePath + mountPath));
        }
    }
    return routes;
}

function registerStatusRoute({ app, pool, port, logger }) {
    app.get('/api/status', async (req, res) => {
        try {
            const healthChecks = {
                express: true,
                cors: true,
                json_parser: true,
                database: false
            };

            const status = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: process.env.NODE_ENV || 'development',
                version: '0.8.2',
                server: {
                    port: port,
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                        external: '0 MB'
                    },
                    platform: process.platform,
                    nodeVersion: process.version
                },
                services: {
                    api: 'operational',
                    database: 'checking...',
                    auth: 'operational'
                },
                healthChecks: healthChecks
            };

            try {
                const client = await pool.connect();
                await client.query('SELECT 1');
                client.release();
                status.services.database = 'operational';
                healthChecks.database = true;
            } catch (dbError) {
                logger.error('Database health check failed', { error: dbError.message });
                status.services.database = 'degraded';
            }

            const allRoutes = collectRoutes(app._router.stack, '');
            const apiRoutes = new Set(allRoutes.filter(path => path && path.startsWith('/api/') && path !== '/api/' && path !== '/api'));

            status.endpoints = {
                total: apiRoutes.size,
                available: Array.from(apiRoutes).sort().slice(0, 50)
            };

            res.status(200).json(status);
        } catch (error) {
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    logger.info('Status endpoint initialized');
}

function registerApiRoutes({
    app,
    pool,
    authenticateJWT,
    publicRateLimit,
    broadcast,
    io,
    port,
    logger
}) {
    logger.info('Mounting route modules...');

    const publicSharingRoute = (kind) => {
        const proxy = createPublicSharingProxy({ kind, logger });
        return publicSharingEnabled() ? [publicRateLimit, proxy] : [proxy];
    };
    app.get('/api/shared/list/:token', ...publicSharingRoute('list'));
    app.get('/api/shared/note/:token', ...publicSharingRoute('note'));
    app.get('/api/shared/whiteboard/:token', ...publicSharingRoute('whiteboard'));
    app.get('/api/shared/wireframe/:token', ...publicSharingRoute('wireframe'));
    app.get('/api/shared/vault/:token', ...publicSharingRoute('vault'));
    logger.info('Public sharing proxy routes initialized');

    app.use('/api', vaultsRoutes(pool, authenticateJWT, broadcast, publicRateLimit));
    logger.info('Vaults routes initialized');
    const contactTransferProxy = createContactTransferProxy({ logger });
    app.get('/api/contacts/export/csv', contactTransferProxy);
    app.post('/api/contacts/import/csv', contactTransferProxy);
    {
        const emailWebhookProxy = createEmailWebhookProxy({ logger });
        const stack = emailWebhooksEnabled()
            ? [publicRateLimit, emailWebhookProxy]
            : [emailWebhookProxy];
        app.post('/api/email/webhook/resend', ...stack);
        logger.info('Email webhook proxy route initialized');
    }
    app.use('/api/email', emailWebhooksRoutes(pool, publicRateLimit));
    logger.info('Email Webhook routes initialized');
    logger.info('Workflows routes initialized');
    {
        const smsWebhookStack = (action) => {
            const proxy = createSmsWebhookProxy({ action, logger });
            return smsWebhooksEnabled() ? [publicRateLimit, proxy] : [proxy];
        };
        app.post('/api/sms-templates/webhook/status', ...smsWebhookStack('status'));
        app.post('/api/sms-templates/webhook/inbound', ...smsWebhookStack('inbound'));
        logger.info('SMS webhook proxy routes initialized');
    }
    app.use('/api/sms-templates', smsWebhooksRoutes(pool, publicRateLimit));
    logger.info('SMS webhook routes initialized');
    app.use('/api/chat-widget', chatWidgetRoutes(
        pool,
        authenticateJWT,
        publicRateLimit,
        io,
        broadcast
    ));
    logger.info('Chat Widget routes initialized');
    logger.info('Email Campaigns routes initialized');
    app.post(
        '/api/invoices/webhook/stripe',
        createStripeInvoiceWebhookProxy({ logger }),
    );
    app.post(
        '/api/invoices/businesses/:id/logo',
        createInvoiceLogoUploadProxy({ targetPath: '/api/invoices/businesses/:id/logo', logger }),
    );
    app.post(
        '/api/invoices/settings/logo',
        createInvoiceLogoUploadProxy({ targetPath: '/api/invoices/settings/logo', logger }),
    );
    app.get('/api/invoices/:id/pdf', createInvoicePdfProxy({ logger }));
    app.use('/api/invoices', invoicesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Invoicing routes initialized');
    {
        const subscriptionWebhookProxy = createSubscriptionWebhookProxy({ logger });
        const stack = subscriptionWebhooksEnabled()
            ? [publicRateLimit, subscriptionWebhookProxy]
            : [subscriptionWebhookProxy];
        app.post('/api/billing/webhook', ...stack);
        logger.info('Subscription webhook proxy route initialized');
    }
    app.use('/api/billing', billingRoutes(pool, authenticateJWT));
    logger.info('Billing routes initialized');
    const publicReputationRoute = (action) => {
        const proxy = createPublicReputationProxy({ action, logger });
        return publicReputationEnabled() ? [publicRateLimit, proxy] : [proxy];
    };
    app.get('/api/reputation/public/widget/:widgetKey', ...publicReputationRoute('widget'));
    app.get('/api/reputation/public/review/:token', ...publicReputationRoute('review-read'));
    app.post('/api/reputation/public/review/:token', ...publicReputationRoute('review-submit'));
    logger.info('Public reputation proxy routes initialized');

    app.use('/api/reputation', reputationRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Reputation Management routes initialized');
    {
        const verifyProxy = createSocialWebhookProxy({ method: 'verify', logger });
        const receiveProxy = createSocialWebhookProxy({ method: 'receive', logger });
        if (socialWebhooksEnabled()) {
            // The raw reader only mounts on the proxied path; when the flag is
            // off the legacy router's own parser must see the untouched stream.
            app.get('/api/social/webhook', publicRateLimit, verifyProxy);
            app.post(
                '/api/social/webhook',
                publicRateLimit,
                express.raw({ type: () => true, limit: '1mb' }),
                receiveProxy,
            );
        } else {
            app.get('/api/social/webhook', verifyProxy);
            app.post('/api/social/webhook', receiveProxy);
        }
        logger.info('Social webhook proxy routes initialized');
    }
    {
        const socialOAuthProxies = createSocialOAuthProxies({ logger });
        app.get('/api/social/connect/facebook', socialOAuthProxies.connect);
        app.get('/api/social/callback/facebook', socialOAuthProxies.callback);
        logger.info('Social OAuth proxy routes initialized');
    }
    app.use('/api/social', socialRoutes(pool, authenticateJWT, publicRateLimit, io));
    logger.info('Social Media Integration routes initialized');
    const publicLandingPagesRoute = (action) => {
        const proxy = createPublicLandingPagesProxy({ action, logger });
        return publicLandingPagesEnabled() ? [publicRateLimit, proxy] : [proxy];
    };
    app.get('/api/pages/public/page/:slug', ...publicLandingPagesRoute('page'));
    app.post('/api/pages/public/page/:slug/analytics', ...publicLandingPagesRoute('analytics'));
    logger.info('Public landing pages proxy routes initialized');

    app.use('/api/pages', pagesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Landing Pages routes initialized');

    const publicBookingsRoute = (action) => {
        const proxy = createPublicBookingsProxy({ action, logger });
        return publicBookingsEnabled() ? [publicRateLimit, proxy] : [proxy];
    };
    app.get('/api/bookings/public/book/:slug', ...publicBookingsRoute('page'));
    app.get('/api/bookings/public/book/:slug/slots', ...publicBookingsRoute('slots'));
    app.post('/api/bookings/public/book/:slug', ...publicBookingsRoute('create'));
    app.post('/api/bookings/public/book/:slug/cancel/:token', ...publicBookingsRoute('cancel'));
    logger.info('Public bookings proxy routes initialized');

    app.use('/api/bookings', bookingsRoutes(pool, publicRateLimit));
    logger.info('Bookings routes initialized');
    // Mirrors the retained router's dedicated submission limiter so the
    // abuse boundary survives when the proxy bypasses the legacy handler.
    const publicFormSubmissionRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: {
                message: 'Too many form submissions from this IP',
                code: 'RATE_LIMIT_EXCEEDED',
            },
        },
    });
    const publicFormsRoute = (action) => {
        const proxy = createPublicFormsProxy({ action, logger });
        if (!publicFormsEnabled()) return [proxy];
        return action === 'submit'
            ? [publicRateLimit, publicFormSubmissionRateLimit, proxy]
            : [publicRateLimit, proxy];
    };
    app.get('/api/forms/public/form/:identifier', ...publicFormsRoute('read'));
    app.post('/api/forms/public/form/:identifier', ...publicFormsRoute('submit'));
    logger.info('Public forms proxy routes initialized');

    app.use('/api/forms', formsRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Forms routes initialized');
    app.post(
        '/api/signatures/documents/upload',
        createSignatureFileUploadProxy({
            targetPath: '/api/signatures/documents/upload',
            logger,
        }),
    );
    app.post(
        '/api/signatures/templates/upload',
        createSignatureFileUploadProxy({
            targetPath: '/api/signatures/templates/upload',
            logger,
        }),
    );
    app.get(
        '/api/signatures/documents/:id/file',
        createSignatureFileReadProxy({ kind: 'document-source', logger }),
    );
    app.get(
        '/api/signatures/documents/:id/download',
        createSignatureFileReadProxy({ kind: 'document-download', logger }),
    );
    app.get(
        '/api/signatures/templates/:id/file',
        createSignatureFileReadProxy({ kind: 'template-source', logger }),
    );
    const publicSigningRoute = (kind, enabled) => {
        const proxy = createPublicSigningProxy({ kind, logger });
        return enabled
            ? [publicRateLimit, proxy]
            : [proxy];
    };
    app.get(
        '/api/public/sign/:token',
        ...publicSigningRoute('session', publicSigningReadsEnabled()),
    );
    app.get(
        '/api/public/sign/:token/file',
        ...publicSigningRoute('file', publicSigningReadsEnabled()),
    );
    app.get(
        '/api/public/sign/:token/download',
        ...publicSigningRoute('download', publicSigningReadsEnabled()),
    );
    app.post(
        '/api/public/sign/:token/verify',
        ...publicSigningRoute('verify', publicSigningMutationsEnabled()),
    );
    app.post(
        '/api/public/sign/:token/decline',
        ...publicSigningRoute('decline', publicSigningMutationsEnabled()),
    );
    app.post(
        '/api/public/sign/:token',
        ...publicSigningRoute('submit', publicSigningMutationsEnabled()),
    );
    const publicEstimateRoute = (action) => {
        const proxy = createPublicEstimateProxy({ action, logger });
        return publicEstimatesEnabled() ? [publicRateLimit, proxy] : [proxy];
    };
    app.get(
        '/api/public/estimates/:token',
        ...publicEstimateRoute('open'),
    );
    app.post(
        '/api/public/estimates/:token/accept',
        ...publicEstimateRoute('accept'),
    );
    app.post(
        '/api/public/estimates/:token/decline',
        ...publicEstimateRoute('decline'),
    );
    logger.info('Signature file and public signing routes initialized');
    {
        const workflowWebhookProxy = createWorkflowWebhookProxy({ logger });
        const stack = workflowWebhooksEnabled()
            ? [publicRateLimit, workflowWebhookProxy]
            : [workflowWebhookProxy];
        app.post('/api/webhooks/:workflowId', ...stack);
        logger.info('Workflow webhook proxy route initialized');
    }
    app.use('/api/webhooks', webhooksRoutes);
    logger.info('Webhooks routes initialized');
    {
        const calendarOAuthRoute = (action) =>
            createCalendarOAuthProxy({ action, logger });
        app.get('/api/calendar-integrations/google/auth', calendarOAuthRoute('auth'));
        app.get('/api/calendar-integrations/google/callback', calendarOAuthRoute('callback'));
        app.get('/api/calendar-integrations/google/calendars/:connectionId', calendarOAuthRoute('calendars'));
        logger.info('Calendar OAuth proxy routes initialized');
    }
    app.use('/api/calendar-integrations', calendarIntegrationsRoutes(pool, authenticateJWT));
    logger.info('Calendar Integrations routes initialized');
    {
        const stripeConnectProxies = createStripeConnectProxies({ logger });
        app.get('/api/invoice-integrations/stripe/connect', stripeConnectProxies.connect);
        app.get('/api/invoice-integrations/stripe/callback', stripeConnectProxies.callback);
        app.post('/api/invoice-integrations/stripe/disconnect', stripeConnectProxies.disconnect);
        logger.info('Stripe Connect proxy routes initialized');
    }
    app.use('/api/invoice-integrations', invoiceIntegrationsRoutes(pool, authenticateJWT));
    logger.info('Invoice Integrations routes initialized');
    app.use('/api', sharingRoutes(pool, authenticateJWT, publicRateLimit, broadcast));
    logger.info('Sharing routes initialized');
    registerStatusRoute({ app, pool, port, logger });

    logger.info('All API routes registered');
}

module.exports = registerApiRoutes;
