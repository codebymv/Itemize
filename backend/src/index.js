/**
 * Itemize Backend Server - Refactored
 * Main entry point that imports and mounts modular routes
 */

// Load environment variables first
require('dotenv').config();

// ===========================
// Environment Variable Validation (Phase 1.4)
// ===========================
const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL'
];

const optionalEnvVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET', 
    'FRONTEND_URL'
];

const missingRequired = requiredEnvVars.filter(v => !process.env[v]);
if (missingRequired.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missingRequired.join(', ')}`);
    process.exit(1);
}

const missingOptional = optionalEnvVars.filter(v => !process.env[v]);
if (missingOptional.length > 0) {
    console.warn(`Warning: Missing optional environment variables: ${missingOptional.join(', ')}`);
}

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

// 2. Request logging with tracing
app.use(requestLogger);

// 3. Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Cookie parsing
app.use(cookieParser());

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
app.use(cors({
    origin: process.env.FRONTEND_URL || (
        process.env.NODE_ENV === 'production'
            ? 'https://itemize.cloud'
            : 'http://localhost:5173'
    ),
    credentials: true
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

// Health check endpoints - KEEP THESE WORKING
app.get('/health', (req, res) => {
    logger.debug('Health check hit');
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    logger.debug('API Health check hit');
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
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
        origin: process.env.FRONTEND_URL || (
            process.env.NODE_ENV === 'production'
                ? 'https://itemize.cloud'
                : 'http://localhost:5173'
        ),
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

        // Lists routes
        const listsRoutes = require('./routes/lists.routes');
        app.use('/api', listsRoutes(pool, authenticateJWT, broadcast));
        logger.info('Lists routes initialized');

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

        // Conversations routes (Inbox)
        const conversationsRoutes = require('./routes/conversations.routes');
        app.use('/api/conversations', conversationsRoutes(pool, authenticateJWT));
        logger.info('Conversations routes initialized');

        // Analytics routes (Dashboard)
        const analyticsRoutes = require('./routes/analytics.routes');
        app.use('/api/analytics', analyticsRoutes(pool, authenticateJWT));
        logger.info('Analytics routes initialized');

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
                            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
                        },
                        platform: process.platform,
                        nodeVersion: process.version
                    },
                    services: {
                        api: 'operational',
                        database: 'checking...',
                        auth: 'operational'
                    }
                };

                // Check database connectivity
                try {
                    const client = await pool.connect();
                    await client.query('SELECT 1');
                    client.release();
                    status.services.database = 'operational';
                } catch (dbError) {
                    logger.error('Database health check failed', { error: dbError.message });
                    status.services.database = 'degraded';
                }

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
