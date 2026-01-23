/**
 * Itemize Backend Server - Refactored
 * Main entry point that imports and mounts modular routes
 */

// Load environment variables first
require('dotenv').config();

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

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Log startup
console.log(`Starting server on port ${port} at ${new Date().toISOString()}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '[REDACTED]' : 'not set'}`);

// Basic middleware
app.use(express.json());
app.use(cookieParser()); // Parse cookies for httpOnly auth tokens
app.use(helmet());
app.use(morgan('combined'));

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

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Health check endpoints - KEEP THESE WORKING
app.get('/health', (req, res) => {
    console.log('Health check hit at:', new Date().toISOString());
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    console.log('API Health check hit at:', new Date().toISOString());
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

// Start the server
server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`✅ WebSocket server ready`);
    console.log('Health check endpoints available at:');
    console.log('  - /health');
    console.log('  - /api/health');
});

server.on('error', (error) => {
    console.error('Server error:', error.message);
});

// Deferred initialization for database-dependent services
setTimeout(async () => {
    console.log('Starting deferred initialization...');

    try {
        // Initialize database connection
        console.log('Initializing database connection...');
        const db = require('./db');
        const pool = db.createDbConnection();

        if (!pool) {
            console.warn('⚠️ Database pool not obtained. API endpoints will not be available.');
            return;
        }

        // Initialize database schema
        try {
            await db.initializeDatabase(pool);
            console.log('✅ Database schema initialized');
        } catch (initError) {
            console.error('❌ Error initializing database schema:', initError.message);
        }

        // Initialize auth routes
        console.log('Initializing auth routes...');
        const { router: authRouter, authenticateJWT } = require('./auth');

        // Make dbPool available to auth routes
        app.use((req, res, next) => {
            req.dbPool = pool;
            next();
        });

        app.use('/api/auth', authRouter);
        console.log('✅ Auth routes initialized');

        // Initialize WebSocket functionality
        console.log('Initializing WebSocket functionality...');
        const initializeWebSocket = require('./lib/websocket');
        const { broadcast } = initializeWebSocket(io, pool);

        // Import and mount route modules
        console.log('Mounting route modules...');

        // Lists routes
        const listsRoutes = require('./routes/lists.routes');
        app.use('/api', listsRoutes(pool, authenticateJWT, broadcast));
        console.log('✅ Lists routes initialized');

        // Notes routes
        const notesRoutes = require('./routes/notes.routes');
        app.use('/api', notesRoutes(pool, authenticateJWT, broadcast));
        console.log('✅ Notes routes initialized');

        // Whiteboards routes
        const whiteboardsRoutes = require('./routes/whiteboards.routes');
        app.use('/api', whiteboardsRoutes(pool, authenticateJWT, broadcast));
        console.log('✅ Whiteboards routes initialized');

        // Categories routes
        const categoriesRoutes = require('./routes/categories.routes');
        app.use('/api', categoriesRoutes(pool, authenticateJWT));
        console.log('✅ Categories routes initialized');

        // Organizations routes (CRM)
        const organizationsRoutes = require('./routes/organizations.routes');
        app.use('/api/organizations', organizationsRoutes(pool, authenticateJWT));
        console.log('✅ Organizations routes initialized');

        // Contacts routes (CRM)
        const contactsRoutes = require('./routes/contacts.routes');
        app.use('/api/contacts', contactsRoutes(pool, authenticateJWT));
        console.log('✅ Contacts routes initialized');

        // Tags routes (CRM)
        const tagsRoutes = require('./routes/tags.routes');
        app.use('/api/tags', tagsRoutes(pool, authenticateJWT));
        console.log('✅ Tags routes initialized');

        // Pipelines and Deals routes (CRM)
        const pipelinesRoutes = require('./routes/pipelines.routes');
        app.use('/api/pipelines', pipelinesRoutes(pool, authenticateJWT));
        console.log('✅ Pipelines routes initialized');

        // Email Templates routes (Automation)
        const emailTemplatesRoutes = require('./routes/email-templates.routes');
        app.use('/api/email-templates', emailTemplatesRoutes(pool, authenticateJWT));
        console.log('✅ Email Templates routes initialized');

        // Workflows routes (Automation)
        const workflowsRoutes = require('./routes/workflows.routes');
        app.use('/api/workflows', workflowsRoutes(pool, authenticateJWT));
        console.log('✅ Workflows routes initialized');

        // SMS Templates routes (SMS/Twilio)
        const smsTemplatesRoutes = require('./routes/sms-templates.routes');
        app.use('/api/sms-templates', smsTemplatesRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ SMS Templates routes initialized');

        // Chat Widget routes (Live Chat)
        const chatWidgetRoutes = require('./routes/chat-widget.routes');
        app.use('/api/chat-widget', chatWidgetRoutes(pool, authenticateJWT, publicRateLimit, io));
        console.log('✅ Chat Widget routes initialized');

        // Email Campaigns routes
        const campaignsRoutes = require('./routes/campaigns.routes');
        app.use('/api/campaigns', campaignsRoutes(pool, authenticateJWT));
        console.log('✅ Email Campaigns routes initialized');

        // Segments routes
        const segmentsRoutes = require('./routes/segments.routes');
        app.use('/api/segments', segmentsRoutes(pool, authenticateJWT));
        console.log('✅ Segments routes initialized');

        // Invoicing routes
        const invoicesRoutes = require('./routes/invoices.routes');
        app.use('/api/invoices', invoicesRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Invoicing routes initialized');

        // Reputation Management routes
        const reputationRoutes = require('./routes/reputation.routes');
        app.use('/api/reputation', reputationRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Reputation Management routes initialized');

        // Social Media Integration routes
        const socialRoutes = require('./routes/social.routes');
        app.use('/api/social', socialRoutes(pool, authenticateJWT, publicRateLimit, io));
        console.log('✅ Social Media Integration routes initialized');

        // Landing Pages routes
        const pagesRoutes = require('./routes/pages.routes');
        app.use('/api/pages', pagesRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Landing Pages routes initialized');

        // Calendars routes (Appointments)
        const calendarsRoutes = require('./routes/calendars.routes');
        app.use('/api/calendars', calendarsRoutes(pool, authenticateJWT));
        console.log('✅ Calendars routes initialized');

        // Bookings routes (Appointments)
        // Note: Public booking routes (/public/book/*) are included in the router
        // and will be accessible via /api/bookings/public/book/* 
        // OR mount a separate public router for /api/public/book/*
        const bookingsRoutes = require('./routes/bookings.routes');
        app.use('/api/bookings', bookingsRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Bookings routes initialized');

        // Forms routes
        // Note: Public form routes (/public/form/*) are included in the router
        const formsRoutes = require('./routes/forms.routes');
        app.use('/api/forms', formsRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Forms routes initialized');

        // Conversations routes (Inbox)
        const conversationsRoutes = require('./routes/conversations.routes');
        app.use('/api/conversations', conversationsRoutes(pool, authenticateJWT));
        console.log('✅ Conversations routes initialized');

        // Analytics routes (Dashboard)
        const analyticsRoutes = require('./routes/analytics.routes');
        app.use('/api/analytics', analyticsRoutes(pool, authenticateJWT));
        console.log('✅ Analytics routes initialized');

        // Calendar Integrations routes (Google/Outlook sync)
        const calendarIntegrationsRoutes = require('./routes/calendar-integrations.routes');
        app.use('/api/calendar-integrations', calendarIntegrationsRoutes(pool, authenticateJWT));
        console.log('✅ Calendar Integrations routes initialized');

        // Sharing routes (includes public shared content endpoints)
        const sharingRoutes = require('./routes/sharing.routes');
        app.use('/api', sharingRoutes(pool, authenticateJWT, publicRateLimit));
        console.log('✅ Sharing routes initialized');

        // AI suggestions endpoints
        try {
            console.log('Initializing AI suggestion service...');
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
                    console.error('Error generating suggestions:', error);
                    res.status(500).json({ error: 'Failed to generate suggestions' });
                }
            });

            console.log('✅ AI suggestion service initialized');
        } catch (aiError) {
            console.error('Failed to initialize AI suggestion service:', aiError.message);
        }

        // Note AI suggestion routes
        try {
            const noteSuggestionsRoutes = require('./routes/noteSuggestions');
            app.use('/api/note-suggestions', noteSuggestionsRoutes);
            console.log('✅ Note AI suggestion service initialized');
        } catch (noteAiError) {
            console.error('Failed to initialize Note AI suggestion service:', noteAiError.message);
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
                    console.error('Database health check failed:', dbError.message);
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

        console.log('✅ Status endpoint initialized');
        console.log('✅ All API routes registered');

        // 404 handler for undefined API routes
        app.use('/api/*', notFoundHandler);
        
        // Structured error handling middleware (must be after all routes)
        app.use(errorHandler);
        console.log('✅ Error handling middleware initialized');

    } catch (dbError) {
        console.error('Database connection error:', dbError.message);
        console.log('Server will continue running for health checks');
    }

    // Static files and catch-all route
    app.use(express.static(path.join(__dirname, '../../frontend/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });

    console.log('✅ Static file serving and catch-all handler registered');
}, 500);
