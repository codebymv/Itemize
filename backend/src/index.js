/**
 * Itemize Backend Server - Refactored
 * Main entry point that imports and mounts modular routes
 */

// Load environment variables first
require('dotenv').config();

// Initialize Sentry for error tracking (Phase 4)
if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
    });
    logger.info('Sentry error tracking initialized');
}

// Validate environment variables (Phase 4)
const { validateEnv } = require('./config/env-validation');
validateEnv();

// Core dependencies
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Structured logging
const { logger, requestLogger } = require('./utils/logger');

// Background job scheduler
const { initScheduler } = require('./scheduler');

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Trust proxy headers in production (Railway/other proxies)
app.set('trust proxy', 1);

// Log startup with structured logger
logger.info('Starting server', { port, timestamp: new Date().toISOString() });
logger.info('Environment configuration', {
    NODE_ENV: process.env.NODE_ENV || 'not set',
    DATABASE_URL: process.env.DATABASE_URL ? '[REDACTED]' : 'not set'
});

// ===========================
// Middleware (Correct Order - Phase 8)
// ===========================

// 1. Security headers FIRST
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "http://localhost:3001"],
            frameSrc: ["'self'", "https://accounts.google.com"],
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true
    },
    crossOriginEmbedderPolicy: false // Required for some third-party integrations
}));

// 2. Correlation ID middleware (Phase 4)
const correlationIdMiddleware = require('./middleware/correlation-id');
app.use(correlationIdMiddleware);

// 3. Request logging with tracing
app.use(requestLogger);

// 4. Body parsing with limits (reduced from 10MB to 1MB for DoS protection)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Input sanitization to prevent XSS and injection attacks
const sanitizeMiddleware = require('./middleware/sanitize');
app.use('/api', sanitizeMiddleware);

// 5. Cookie parsing
app.use(cookieParser());

// Database pool monitoring middleware (registered after pool initialization)
const dbMonitor = require('./middleware/db-monitor');

// 5. HTTP request logging (development)
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Force HTTPS in production (exclude health checks)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.path === '/health' || req.path === '/api/health') {
            return next();
        }
        if (req.header('x-forwarded-proto') !== 'https') {
            return res.redirect(301, `https://${req.header('host')}${req.url}`);
        }
        next();
    });
}

// CORS configuration
const corsOrigin = process.env.FRONTEND_URL || (
    process.env.NODE_ENV === 'production'
        ? 'https://itemize.cloud'
        : 'http://localhost:5173'
);

// Allowed origins list
const allowedOrigins = [
    corsOrigin,
    'https://itemize.cloud',
    'https://itemize.up.railway.app'
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin matches allowed origins or is a GitHub Codespaces URL
        const isAllowed = allowedOrigins.some(allowed => origin === allowed) ||
            origin.includes('.app.github.dev') ||
            origin.includes('localhost');

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Organization-Id'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Serve uploaded files (logos, etc.) - registered early so it's available immediately
// Add CORS headers for cross-origin image loading (needed for localhost dev with separate ports)
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
}, express.static(path.join(__dirname, '../uploads')));

// ===========================
// Rate Limiting (Phase 7)
// ===========================

// Global API rate limit
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } }
});

// Stricter limit for write operations
const writeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 writes per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}-${req.user?.id || 'anon'}`,
    message: { error: { message: 'Too many write requests', code: 'RATE_LIMIT_EXCEEDED' } }
});

// Higher limit for high-frequency canvas position updates
const positionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 position updates per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}-${req.user?.id || 'anon'}`,
    message: { error: { message: 'Too many position updates', code: 'RATE_LIMIT_EXCEEDED' } }
});

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    message: { error: { message: 'Too many requests from this IP', code: 'RATE_LIMIT_EXCEEDED' } },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply global rate limit to all API routes
app.use('/api', globalLimiter);

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    const pool = req.dbPool || dbPool;

    try {
        const checks = {
            database: {
                ok: false,
                message: 'Unknown',
                latency: 0,
            },
        };

        if (pool) {
            try {
                const dbStart = Date.now();
                const dbResult = await pool.query('SELECT 1');
                const dbLatency = Date.now() - dbStart;
                
                checks.database = {
                    ok: dbResult.rows.length > 0,
                    message: dbResult.rows.length > 0 ? 'Connected' : 'No rows returned',
                    latency: dbLatency,
                };
            } catch (err) {
                checks.database = {
                    ok: false,
                    message: err.message,
                    latency: 0,
                };
            }
        }

        const requiredChecks = {
            database: checks.database,
        };

        const optionalChecks = {
            email: {
                ok: Boolean(process.env.RESEND_API_KEY),
                message: process.env.RESEND_API_KEY ? 'Configured' : 'Not configured',
            },
            twilio: {
                ok: Boolean(process.env.TWILIO_ACCOUNT_SID),
                message: process.env.TWILIO_ACCOUNT_SID ? 'Configured' : 'Not configured',
            },
        };

        const requiredHealthy = Object.values(requiredChecks).every(c => c.ok);
        const optionalHealthy = Object.values(optionalChecks).every(c => c.ok);

        const response = {
            status: requiredHealthy ? (optionalHealthy ? 'healthy' : 'degraded') : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            checks: { ...requiredChecks, ...optionalChecks },
        };

        const statusCode = requiredHealthy ? 200 : 503;
        return res.status(statusCode).json(response);
    } catch (error) {
        console.error('Health check failed:', error);
        return res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
        });
    }
});

app.get('/health', (req, res) => {
    res.redirect('/api/health');
});

// Docs routes (already modular)
const docsRoutes = require('./routes/docs');
app.use('/docs', docsRoutes);

// Import structured error handling
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Create HTTP server and Socket.IO
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'https://itemize.cloud',
            'https://itemize.up.railway.app'
        ],
        methods: ['GET', 'POST']
    }
});

// Store pool reference for graceful shutdown
let dbPool = null;

// Start the server
server.listen(port, '0.0.0.0', () => {
    logger.info('Server started successfully', { port });
    logger.info('WebSocket server ready');
    logger.info('Health check endpoints available', { endpoints: ['/health', '/api/health'] });
});

server.on('error', (error) => {
    logger.error('Server error', { error: error.message, stack: error.stack });
});

// ===========================
// Graceful Shutdown Handler (Phase 1.1)
// ===========================
const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
        logger.info('HTTP server closed');

        if (dbPool) {
            try {
                await dbPool.end();
                logger.info('Database pool closed');
            } catch (err) {
                logger.error('Error closing database pool', { error: err.message });
            }
        }

        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global unhandled error handlers (Phase 4.3)
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason: String(reason), promise: String(promise) });
});

// Deferred initialization for database-dependent services
setTimeout(async () => {
    logger.info('Starting deferred initialization...');

    try {
        // Initialize database connection
        logger.info('Initializing database connection...');
        const db = require('./db');
        const pool = db.createDbConnection();

        if (!pool) {
            logger.warn('Database pool not obtained. API endpoints will not be available.');
            return;
        }

// Store pool reference for graceful shutdown
dbPool = pool;

// Register database pool monitoring middleware (Phase 4)
app.use(dbMonitor(pool));

        // Initialize database schema
        try {
            await db.initializeDatabase(pool);
            logger.info('Database schema initialized');
        } catch (initError) {
            logger.error('Error initializing database schema', { error: initError.message });
        }

        // Initialize auth routes
        logger.info('Initializing auth routes...');
        const { router: authRouter, authenticateJWT, requireAdmin } = require('./auth');

        // Make dbPool available to auth routes
        app.use((req, res, next) => {
            req.dbPool = pool;
            next();
        });

        app.use('/api/auth', authRouter);
        logger.info('Auth routes initialized');

        // Initialize WebSocket functionality
        logger.info('Initializing WebSocket functionality...');
        const initializeWebSocket = require('./lib/websocket');
        const { broadcast } = initializeWebSocket(io, pool);

        // Import and mount route modules
        logger.info('Mounting route modules...');

        // Rate limit high-frequency position updates
        app.put('/api/lists/:id/position', positionLimiter);
        app.put('/api/whiteboards/:id/position', positionLimiter);
        app.put('/api/wireframes/:id/position', positionLimiter);
        app.put('/api/vaults/:vaultId/position', positionLimiter);
        app.put('/api/canvas/positions', positionLimiter);

        // Lists routes
        const listsRoutes = require('./routes/lists.routes');
        app.use('/api', listsRoutes(pool, authenticateJWT, broadcast));
        logger.info('Lists routes initialized');

        // Canvas routes (batched updates)
        const canvasRoutes = require('./routes/canvas.routes');
        app.use('/api', canvasRoutes(pool, authenticateJWT, broadcast));
        logger.info('Canvas routes initialized');

        // Notes routes
        const notesRoutes = require('./routes/notes.routes');
        app.use('/api', notesRoutes(pool, authenticateJWT, broadcast));
        logger.info('Notes routes initialized');

        // Whiteboards routes
        const whiteboardsRoutes = require('./routes/whiteboards.routes');
        app.use('/api', whiteboardsRoutes(pool, authenticateJWT, broadcast));
        logger.info('Whiteboards routes initialized');

        // Wireframes routes (React Flow diagrams)
        const wireframesRoutes = require('./routes/wireframes.routes');
        app.use('/api', wireframesRoutes(pool, authenticateJWT, broadcast));
        logger.info('Wireframes routes initialized');

        // Vaults routes (encrypted storage)
        const vaultsRoutes = require('./routes/vaults.routes');
        app.use('/api', vaultsRoutes(pool, authenticateJWT, broadcast));
        logger.info('Vaults routes initialized');

        // Categories routes
        const categoriesRoutes = require('./routes/categories.routes');
        app.use('/api', categoriesRoutes(pool, authenticateJWT));
        logger.info('Categories routes initialized');

        // Organizations routes (CRM)
        const organizationsRoutes = require('./routes/organizations.routes');
        app.use('/api/organizations', organizationsRoutes(pool, authenticateJWT));
        logger.info('Organizations routes initialized');

        // Contacts routes (CRM)
        const contactsRoutes = require('./routes/contacts.routes');
        app.use('/api/contacts', contactsRoutes(pool, authenticateJWT));
        logger.info('Contacts routes initialized');

        // Tags routes (CRM)
        const tagsRoutes = require('./routes/tags.routes');
        app.use('/api/tags', tagsRoutes(pool, authenticateJWT));
        logger.info('Tags routes initialized');

        // Pipelines and Deals routes (CRM)
        const pipelinesRoutes = require('./routes/pipelines.routes');
        app.use('/api/pipelines', pipelinesRoutes(pool, authenticateJWT));
        logger.info('Pipelines routes initialized');

        // Email Templates routes (Automation)
        const emailTemplatesRoutes = require('./routes/email-templates.routes');
        app.use('/api/email-templates', emailTemplatesRoutes(pool, authenticateJWT));
        logger.info('Email Templates routes initialized');

        // Workflows routes (Automation)
        const workflowsRoutes = require('./routes/workflows.routes');
        app.use('/api/workflows', workflowsRoutes(pool, authenticateJWT));
        logger.info('Workflows routes initialized');

        // SMS Templates routes (SMS/Twilio)
        const smsTemplatesRoutes = require('./routes/sms-templates.routes');
        app.use('/api/sms-templates', smsTemplatesRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('SMS Templates routes initialized');

        // Chat Widget routes (Live Chat)
        const chatWidgetRoutes = require('./routes/chat-widget.routes');
        app.use('/api/chat-widget', chatWidgetRoutes(pool, authenticateJWT, publicRateLimit, io));
        logger.info('Chat Widget routes initialized');

        // Email Campaigns routes
        const campaignsRoutes = require('./routes/campaigns.routes');
        app.use('/api/campaigns', campaignsRoutes(pool, authenticateJWT));
        logger.info('Email Campaigns routes initialized');

        // Segments routes
        const segmentsRoutes = require('./routes/segments.routes');
        app.use('/api/segments', segmentsRoutes(pool, authenticateJWT));
        logger.info('Segments routes initialized');

        // Estimates routes (Quotes) - MUST be registered before invoices to avoid /:id catching "estimates"
        const estimatesRoutes = require('./routes/estimates.routes');
        app.use('/api/invoices/estimates', estimatesRoutes(pool, authenticateJWT));
        logger.info('Estimates routes initialized');

        // Recurring Invoices routes - MUST be registered before invoices to avoid /:id catching "recurring"
        const recurringRoutes = require('./routes/recurring.routes');
        app.use('/api/invoices/recurring', recurringRoutes(pool, authenticateJWT));
        logger.info('Recurring Invoices routes initialized');

        // Invoicing routes
        const invoicesRoutes = require('./routes/invoices.routes');
        app.use('/api/invoices', invoicesRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Invoicing routes initialized');

        // Billing routes (simplified Stripe integration - gleamai pattern)
        const billingRoutes = require('./routes/billing.routes');
        app.use('/api/billing', billingRoutes(pool, authenticateJWT));
        logger.info('Billing routes initialized');

        // Legacy Subscriptions routes (for backward compatibility)
        // TODO: Remove once frontend is fully migrated to /api/billing
        const subscriptionsRoutes = require('./routes/subscriptions.routes');
        app.use('/api/subscriptions', subscriptionsRoutes(pool));
        logger.info('Subscriptions routes initialized');

        // Reputation Management routes
        const reputationRoutes = require('./routes/reputation.routes');
        app.use('/api/reputation', reputationRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Reputation Management routes initialized');

        // Social Media Integration routes
        const socialRoutes = require('./routes/social.routes');
        app.use('/api/social', socialRoutes(pool, authenticateJWT, publicRateLimit, io));
        logger.info('Social Media Integration routes initialized');

        // Landing Pages routes
        const pagesRoutes = require('./routes/pages.routes');
        app.use('/api/pages', pagesRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Landing Pages routes initialized');

        // Page Versions routes (staging, versioning, rollback)
        const pageVersionsRoutes = require('./routes/pageVersions.routes');
        const { requireOrganization } = require('./middleware/organization')(pool);
        app.use('/api/pages', pageVersionsRoutes(pool, authenticateJWT, requireOrganization));
        logger.info('Page Versions routes initialized');

        // Preview routes (public page and version previews)
        const previewRoutes = require('./routes/preview.routes');
        app.use('/api/preview', previewRoutes(pool));
        logger.info('Preview routes initialized');

        // Calendars routes (Appointments)
        const calendarsRoutes = require('./routes/calendars.routes');
        app.use('/api/calendars', calendarsRoutes(pool, authenticateJWT));
        logger.info('Calendars routes initialized');

        // Bookings routes (Appointments)
        // Note: Public booking routes (/public/book/*) are included in the router
        // and will be accessible via /api/bookings/public/book/* 
        // OR mount a separate public router for /api/public/book/*
        const bookingsRoutes = require('./routes/bookings.routes');
        app.use('/api/bookings', bookingsRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Bookings routes initialized');

        // Forms routes
        // Note: Public form routes (/public/form/*) are included in the router
        const formsRoutes = require('./routes/forms.routes');
        app.use('/api/forms', formsRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Forms routes initialized');

        // Signatures routes (includes public signing endpoints)
        const signaturesRoutes = require('./routes/signatures.routes');
        app.use('/api', signaturesRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Signatures routes initialized');

        // Conversations routes (Inbox)
        const conversationsRoutes = require('./routes/conversations.routes');
        app.use('/api/conversations', conversationsRoutes(pool, authenticateJWT));
        logger.info('Conversations routes initialized');

        // Analytics routes (Dashboard)
        const analyticsRoutes = require('./routes/analytics.routes');
        app.use('/api/analytics', analyticsRoutes(pool, authenticateJWT));
        logger.info('Analytics routes initialized');

        // Contact Profiles (unified client view)
        const contactProfileRoutes = require('./routes/contact-profile.routes');
        app.use('/api/contacts', contactProfileRoutes);
        logger.info('Contact Profile routes initialized');

        // Cross-Module Search
        const searchRoutes = require('./routes/search.routes');
        app.use('/api', searchRoutes);
        logger.info('Search routes initialized');

        // Workflow Webhooks
        const webhooksRoutes = require('./routes/webhooks.routes');
        app.use('/api/webhooks', webhooksRoutes);
        logger.info('Webhooks routes initialized');

        // Calendar Integrations routes (Google/Outlook sync)
        const calendarIntegrationsRoutes = require('./routes/calendar-integrations.routes');
        app.use('/api/calendar-integrations', calendarIntegrationsRoutes(pool, authenticateJWT));
        logger.info('Calendar Integrations routes initialized');

        // Sharing routes (includes public shared content endpoints)
        const sharingRoutes = require('./routes/sharing.routes');
        app.use('/api', sharingRoutes(pool, authenticateJWT, publicRateLimit));
        logger.info('Sharing routes initialized');

        // Admin routes (requires ADMIN role)
        const adminRoutes = require('./routes/admin.routes');
        app.use('/api/admin', adminRoutes(pool, authenticateJWT, requireAdmin));
        logger.info('Admin routes initialized');

        // Admin Email routes (requires ADMIN role)
        const adminEmailRoutes = require('./routes/admin-email.routes');
        app.use('/api/admin/email', adminEmailRoutes(pool, authenticateJWT, requireAdmin));
        logger.info('Admin Email routes initialized');

        // Onboarding routes
        const onboardingRoutes = require('./routes/onboarding.routes');
        app.use('/api/onboarding', onboardingRoutes(pool, authenticateJWT));
        logger.info('Onboarding routes initialized');

        // AI suggestions endpoints
        try {
            logger.info('Initializing AI suggestion service...');
            const aiSuggestionService = require('./services/aiSuggestionService');

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

        // Note AI suggestion routes
        try {
            const noteSuggestionsRoutes = require('./routes/noteSuggestions');
            app.use('/api/note-suggestions', noteSuggestionsRoutes);
            logger.info('Note AI suggestion service initialized');
        } catch (noteAiError) {
            logger.warn('Failed to initialize Note AI suggestion service', { error: noteAiError.message });
        }

        // Status endpoint
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

                // Check database connectivity
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

                // Get all registered routes by traversing router stack
                const collectRoutes = (stack, basePath = '') => {
                    const routes = [];
                    for (const layer of stack) {
                        if (layer.route && layer.route.path) {
                            // Direct route on this router
                            const path = layer.route.path;
                            if (path && !path.includes('*') && !path.includes('/status')) {
                                routes.push((basePath + path).replace(/\/:([^/]+)/g, '/:$1'));
                            }
                        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                            // Nested router - recursively collect its routes
                            // Try to extract the mount path from layer.regexp
                            let mountPath = '';
                            if (layer.regexp && layer.regexp.source) {
                                const regexSource = layer.regexp.source;
                                // Extract path from regex like ^\/api\/invoices
                                const match = regexSource.match(/^\^\\\/(.+?)(?:\\\?\\$)?$/);
                                if (match) {
                                    mountPath = '/' + match[1].replace(/\\\//g, '/');
                                }
                            }
                            routes.push(...collectRoutes(layer.handle.stack, basePath + mountPath));
                        }
                    }
                    return routes;
                };

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
        logger.info('All API routes registered');

        // Initialize background job scheduler
        initScheduler(pool);
        logger.info('Background job scheduler initialized');

        // 404 handler for undefined API routes
        app.use('/api/*', notFoundHandler);

        // Structured error handling middleware (must be after all routes)
        app.use(errorHandler);
        logger.info('Error handling middleware initialized');

    } catch (dbError) {
        logger.error('Database connection error', { error: dbError.message });
        logger.info('Server will continue running for health checks');
    }

    // Static files and catch-all route
    app.use(express.static(path.join(__dirname, '../../frontend/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });

    logger.info('Static file serving and catch-all handler registered');
}, 500);
