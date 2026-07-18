const listsRoutes = require('../routes/lists.routes');
const canvasRoutes = require('../routes/canvas.routes');
const notesRoutes = require('../routes/notes.routes');
const whiteboardsRoutes = require('../routes/whiteboards.routes');
const wireframesRoutes = require('../routes/wireframes.routes');
const vaultsRoutes = require('../routes/vaults.routes');
const categoriesRoutes = require('../routes/categories.routes');
const organizationsRoutes = require('../routes/organizations.routes');
const contactsRoutes = require('../routes/contacts.routes');
const { createContactTransferProxy } = require('../contact-transfer-proxy');
const tagsRoutes = require('../routes/tags.routes');
const pipelinesRoutes = require('../routes/pipelines.routes');
const emailTemplatesRoutes = require('../routes/email-templates.routes');
const emailWebhooksRoutes = require('../routes/email-webhooks.routes');
const workflowsRoutes = require('../routes/workflows.routes');
const smsTemplatesRoutes = require('../routes/sms-templates.routes');
const chatWidgetRoutes = require('../routes/chat-widget.routes');
const marketingChatRoutes = require('../routes/marketing-chat.routes');
const campaignsRoutes = require('../routes/campaigns.routes');
const segmentsRoutes = require('../routes/segments.routes');
const estimatesRoutes = require('../routes/estimates.routes');
const recurringRoutes = require('../routes/recurring.routes');
const invoicesRoutes = require('../routes/invoices.routes');
const billingRoutes = require('../routes/billing.routes');
const reputationRoutes = require('../routes/reputation.routes');
const socialRoutes = require('../routes/social.routes');
const pagesRoutes = require('../routes/pages.routes');
const pageVersionsRoutes = require('../routes/pageVersions.routes');
const previewRoutes = require('../routes/preview.routes');
const calendarsRoutes = require('../routes/calendars.routes');
const bookingsRoutes = require('../routes/bookings.routes');
const formsRoutes = require('../routes/forms.routes');
const signaturesRoutes = require('../routes/signatures.routes');
const conversationsRoutes = require('../routes/conversations.routes');
const analyticsRoutes = require('../routes/analytics.routes');
const contactProfileRoutes = require('../routes/contact-profile.routes');
const searchRoutes = require('../routes/search.routes');
const webhooksRoutes = require('../routes/webhooks.routes');
const calendarIntegrationsRoutes = require('../routes/calendar-integrations.routes');
const sharingRoutes = require('../routes/sharing.routes');
const adminRoutes = require('../routes/admin.routes');
const adminEmailRoutes = require('../routes/admin-email.routes');
const onboardingRoutes = require('../routes/onboarding.routes');

function registerPositionLimiters(app, positionLimiter) {
    app.put('/api/lists/:id/position', positionLimiter);
    app.put('/api/whiteboards/:id/position', positionLimiter);
    app.put('/api/wireframes/:id/position', positionLimiter);
    app.put('/api/vaults/:vaultId/position', positionLimiter);
    app.put('/api/canvas/positions', positionLimiter);
}

function registerAiSuggestionRoutes({ app, authenticateJWT, logger }) {
    try {
        logger.info('Initializing AI suggestion service...');
        const aiSuggestionService = require('../services/aiSuggestionService');

        app.post('/api/suggestions', authenticateJWT, async (req, res) => {
            try {
                const { listTitle, existingItems } = req.body;

                if (!listTitle || !Array.isArray(existingItems)) {
                    return res.status(400).json({ error: 'Invalid request parameters' });
                }

                const result = await aiSuggestionService.suggestListItems(listTitle, existingItems);
                res.json(result);
            } catch (error) {
                logger.error('Error generating suggestions', { error: error.message });
                res.status(500).json({ error: 'Failed to generate suggestions' });
            }
        });

        logger.info('AI suggestion service initialized');
    } catch (aiError) {
        logger.warn('Failed to initialize AI suggestion service', { error: aiError.message });
    }
}

function registerNoteSuggestionRoutes({ app, logger }) {
    try {
        const noteSuggestionsRoutes = require('../routes/noteSuggestions');
        app.use('/api/note-suggestions', noteSuggestionsRoutes);
        logger.info('Note AI suggestion service initialized');
    } catch (noteAiError) {
        logger.warn('Failed to initialize Note AI suggestion service', { error: noteAiError.message });
    }
}

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
    requireAdmin,
    publicRateLimit,
    positionLimiter,
    broadcast,
    io,
    port,
    logger
}) {
    logger.info('Mounting route modules...');

    registerPositionLimiters(app, positionLimiter);

    app.use('/api', listsRoutes(pool, authenticateJWT, broadcast));
    logger.info('Lists routes initialized');
    app.use('/api', canvasRoutes(pool, authenticateJWT, broadcast));
    logger.info('Canvas routes initialized');
    app.use('/api', notesRoutes(pool, authenticateJWT, broadcast));
    logger.info('Notes routes initialized');
    app.use('/api', whiteboardsRoutes(pool, authenticateJWT, broadcast));
    logger.info('Whiteboards routes initialized');
    app.use('/api', wireframesRoutes(pool, authenticateJWT, broadcast));
    logger.info('Wireframes routes initialized');
    app.use('/api', vaultsRoutes(pool, authenticateJWT, broadcast, publicRateLimit));
    logger.info('Vaults routes initialized');
    app.use('/api', categoriesRoutes(pool, authenticateJWT));
    logger.info('Categories routes initialized');
    app.use('/api/organizations', organizationsRoutes(pool, authenticateJWT));
    logger.info('Organizations routes initialized');
    const contactTransferProxy = createContactTransferProxy({ logger });
    app.get('/api/contacts/export/csv', contactTransferProxy);
    app.post('/api/contacts/import/csv', contactTransferProxy);
    app.use('/api/contacts', contactsRoutes(pool, authenticateJWT));
    logger.info('Contacts routes initialized');
    app.use('/api/tags', tagsRoutes(pool, authenticateJWT));
    logger.info('Tags routes initialized');
    app.use('/api/pipelines', pipelinesRoutes(pool, authenticateJWT));
    logger.info('Pipelines routes initialized');
    app.use('/api/email-templates', emailTemplatesRoutes(pool, authenticateJWT));
    logger.info('Email Templates routes initialized');
    app.use('/api/email', emailWebhooksRoutes(pool, publicRateLimit));
    logger.info('Email Webhook routes initialized');
    app.use('/api/workflows', workflowsRoutes(pool, authenticateJWT));
    logger.info('Workflows routes initialized');
    app.use('/api/sms-templates', smsTemplatesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('SMS Templates routes initialized');
    app.use('/api/chat-widget', chatWidgetRoutes(
        pool,
        authenticateJWT,
        publicRateLimit,
        io,
        broadcast
    ));
    logger.info('Chat Widget routes initialized');
    app.use('/api/marketing-chat', marketingChatRoutes(publicRateLimit));
    logger.info('Marketing Chat routes initialized');
    app.use('/api/campaigns', campaignsRoutes(pool, authenticateJWT));
    logger.info('Email Campaigns routes initialized');
    app.use('/api/segments', segmentsRoutes(pool, authenticateJWT));
    logger.info('Segments routes initialized');
    app.use('/api/invoices/estimates', estimatesRoutes(pool, authenticateJWT));
    logger.info('Estimates routes initialized');
    app.use('/api/invoices/recurring', recurringRoutes(pool, authenticateJWT));
    logger.info('Recurring Invoices routes initialized');
    app.use('/api/invoices', invoicesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Invoicing routes initialized');
    app.use('/api/billing', billingRoutes(pool, authenticateJWT));
    logger.info('Billing routes initialized');
    app.use('/api/reputation', reputationRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Reputation Management routes initialized');
    app.use('/api/social', socialRoutes(pool, authenticateJWT, publicRateLimit, io));
    logger.info('Social Media Integration routes initialized');
    app.use('/api/pages', pagesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Landing Pages routes initialized');

    const { requireOrganization } = require('../middleware/organization')(pool);
    app.use('/api/pages', pageVersionsRoutes(pool, authenticateJWT, requireOrganization));
    logger.info('Page Versions routes initialized');

    app.use('/api/preview', previewRoutes(pool));
    logger.info('Preview routes initialized');
    app.use('/api/calendars', calendarsRoutes(pool, authenticateJWT));
    logger.info('Calendars routes initialized');
    app.use('/api/bookings', bookingsRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Bookings routes initialized');
    app.use('/api/forms', formsRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Forms routes initialized');
    app.use('/api', signaturesRoutes(pool, authenticateJWT, publicRateLimit));
    logger.info('Signatures routes initialized');
    app.use('/api/conversations', conversationsRoutes(pool, authenticateJWT));
    logger.info('Conversations routes initialized');
    app.use('/api/analytics', analyticsRoutes(pool, authenticateJWT));
    logger.info('Analytics routes initialized');
    app.use('/api/contacts', contactProfileRoutes(pool, authenticateJWT));
    logger.info('Contact Profile routes initialized');
    app.use('/api/search', searchRoutes);
    logger.info('Search routes initialized');
    app.use('/api/webhooks', webhooksRoutes);
    logger.info('Webhooks routes initialized');
    app.use('/api/calendar-integrations', calendarIntegrationsRoutes(pool, authenticateJWT));
    logger.info('Calendar Integrations routes initialized');
    app.use('/api', sharingRoutes(pool, authenticateJWT, publicRateLimit, broadcast));
    logger.info('Sharing routes initialized');
    app.use('/api/admin', adminRoutes(pool, authenticateJWT, requireAdmin));
    logger.info('Admin routes initialized');
    app.use('/api/admin/email', adminEmailRoutes(pool, authenticateJWT, requireAdmin));
    logger.info('Admin Email routes initialized');
    app.use('/api/onboarding', onboardingRoutes(pool, authenticateJWT));
    logger.info('Onboarding routes initialized');

    registerAiSuggestionRoutes({ app, authenticateJWT, logger });
    registerNoteSuggestionRoutes({ app, logger });
    registerStatusRoute({ app, pool, port, logger });

    logger.info('All API routes registered');
}

module.exports = registerApiRoutes;
