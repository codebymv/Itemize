/**
 * Itemize Backend Server - Refactored
 * Main entry point that imports and mounts modular routes
 */

// Load environment variables first
require('dotenv').config();

// Structured logging
const { logger, requestLogger } = require('./utils/logger');

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

// Background job scheduler
const { initScheduler } = require('./scheduler');
const registerApiRoutes = require('./bootstrap/register-api-routes');
const { createCorsOptionsDelegate } = require('./config/cors-options');

// Create Express app
const app = express();
const port = process.env.PORT || 3001;
const HEALTHCHECK_STARTUP_GRACE_MS = parseInt(process.env.HEALTHCHECK_STARTUP_GRACE_MS || '60000', 10);
const healthcheckStartedAt = Date.now();

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
// NOTE: Stripe webhook route uses express.raw() and must be mounted BEFORE this
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = Buffer.from(buf);
    }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Input sanitization to prevent XSS and injection attacks
// NOTE: Exclude webhook path from sanitization (raw body needed for signature verification)
const sanitizeMiddleware = require('./middleware/sanitize');
app.use('/api', (req, res, next) => {
    if (req.path === '/billing/webhook' || req.path === '/social/webhook') {
        return next();
    }
    sanitizeMiddleware(req, res, next);
});

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

// Allowed origins: primary URL, fixed deploy hosts, optional comma-separated EXTRA_CORS_ORIGINS (e.g. staging).
const extraCorsOrigins = (process.env.EXTRA_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const allowedOrigins = [...new Set([
    corsOrigin,
    'https://itemize.cloud',
    'https://itemize.up.railway.app',
    ...extraCorsOrigins,
])];

// Review widgets are intentionally embedded on third-party sites. Their
// capability-keyed, read-only endpoint permits credential-free cross-origin
// GETs; every other route retains the authenticated origin allowlist.
app.use(cors(createCorsOptionsDelegate(allowedOrigins, process.env.NODE_ENV)));

// CSRF token endpoint and protection for cookie-authenticated writes
const { csrfProtection, issueCsrfToken } = require('./middleware/csrf');
app.get('/api/auth/csrf', issueCsrfToken);
app.use('/api', csrfProtection);

// Only validated public logo assets are served statically. Signature documents
// must pass through organization- or capability-authorized file routes.
const { createPublicUploadsRouter } = require('./lib/publicUploads');
app.use('/uploads', createPublicUploadsRouter(path.join(__dirname, '../uploads')));

// ===========================
// Rate Limiting (Phase 7)
// ===========================

// Helper to send 429 with Retry-After header (seconds)
const rateLimitHandler = (message, retryAfterSeconds = 60) => (req, res) => {
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json(message);
};

// Global API rate limit
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } },
    handler: rateLimitHandler({ error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } }, 900),
});

// Stricter limit for write operations
const _writeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 writes per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}-${req.user?.id || 'anon'}`,
    message: { error: { message: 'Too many write requests', code: 'RATE_LIMIT_EXCEEDED' } },
    handler: rateLimitHandler({ error: { message: 'Too many write requests', code: 'RATE_LIMIT_EXCEEDED' } }),
});

// Higher limit for high-frequency canvas position updates
const positionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 position updates per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}-${req.user?.id || 'anon'}`,
    message: { error: { message: 'Too many position updates', code: 'RATE_LIMIT_EXCEEDED' } },
    handler: rateLimitHandler({ error: { message: 'Too many position updates', code: 'RATE_LIMIT_EXCEEDED' } }),
});

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 300,
    message: { error: { message: 'Too many requests from this IP', code: 'RATE_LIMIT_EXCEEDED' } },
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler({ error: { message: 'Too many requests from this IP', code: 'RATE_LIMIT_EXCEEDED' } }, 3600),
});

// Apply global rate limit to all API routes
app.use('/api', globalLimiter);

// Keep browser authentication on the established API origin while the NestJS
// GraphQL service runs side-by-side on Railway's private network.
const { createGraphqlProxy } = require('./graphql-proxy');
app.use('/graphql', globalLimiter);
app.post('/graphql', createGraphqlProxy({ logger }));
app.all('/graphql', (req, res) => {
    res.set('Allow', 'POST, OPTIONS');
    res.status(405).json({
        errors: [{
            message: 'Method not allowed',
            extensions: { code: 'METHOD_NOT_ALLOWED' },
        }],
        data: null,
    });
});

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
    const pool = req.dbPool || dbPool;
    const now = Date.now();
    const inStartupGrace = now - healthcheckStartedAt < HEALTHCHECK_STARTUP_GRACE_MS;

    if (!pool && inStartupGrace) {
        return res.status(200).json({
            status: 'starting',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            checks: {
                database: {
                    ok: false,
                    message: 'Database not initialized yet',
                    latency: 0,
                },
                email: {
                    ok: Boolean(process.env.RESEND_API_KEY),
                    message: process.env.RESEND_API_KEY ? 'Configured' : 'Not configured',
                },
                twilio: {
                    ok: Boolean(process.env.TWILIO_ACCOUNT_SID),
                    message: process.env.TWILIO_ACCOUNT_SID ? 'Configured' : 'Not configured',
                },
            },
            startup: `Grace period ${HEALTHCHECK_STARTUP_GRACE_MS}ms`,
        });
    }

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
                logger.error('Database health check failed', { error: err.message });
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
            stripe: {
                ok: Boolean(process.env.STRIPE_SECRET_KEY),
                message: process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured',
            },
            aws: {
                ok: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
                message: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'Configured' : 'Not configured',
            },
            google: {
                ok: Boolean(process.env.GOOGLE_CLIENT_ID),
                message: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured',
            },
            sentry: {
                ok: Boolean(process.env.SENTRY_DSN),
                message: process.env.SENTRY_DSN ? 'Configured' : 'Not configured',
            },
        };

        const databaseOptionalDuringStartup = !pool;
        const requiredHealthy = databaseOptionalDuringStartup
            ? true
            : Object.values(requiredChecks).every(c => c.ok);
        const optionalHealthy = Object.values(optionalChecks).every(c => c.ok);

        const response = {
            status: requiredHealthy ? (optionalHealthy ? 'healthy' : 'degraded') : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            checks: { ...requiredChecks, ...optionalChecks },
            startup: databaseOptionalDuringStartup ? 'database not initialized yet' : undefined,
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
        methods: ['GET', 'POST'],
        credentials: true
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

process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled Rejection', { reason: String(reason) });
    // In production, unhandled rejections should crash the process
    // to prevent undefined state
    if (process.env.NODE_ENV === 'production') {
        logger.error('Crashing process due to unhandled rejection in production');
        process.exit(1);
    }
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

        // Initialize database schema only when explicitly allowed.
        // Production deploys should run backend/scripts/run-migrations.js first.
        if (process.env.NODE_ENV === 'production' && process.env.RUN_STARTUP_MIGRATIONS !== 'true') {
            const migrationCheck = await pool.query(`
                SELECT to_regclass('public.schema_migrations') IS NOT NULL AS has_schema_migrations
            `);
            if (!migrationCheck.rows[0]?.has_schema_migrations) {
                throw new Error('schema_migrations table missing. Run backend/scripts/run-migrations.js before starting production.');
            }
            const requiredMigrationCheck = await pool.query(`
                SELECT EXISTS (
                    SELECT 1 FROM schema_migrations
                    WHERE version = '042_signature_delivery_outbox'
                ) AS has_required_migration
            `);
            if (!requiredMigrationCheck.rows[0]?.has_required_migration) {
                throw new Error('Required migrations are missing. Run backend/scripts/run-migrations.js before starting production.');
            }
            logger.info('Skipping startup schema migrations in production');
        } else {
            try {
                await db.initializeDatabase(pool);
                logger.info('Database schema initialized');
            } catch (initError) {
                logger.error('Error initializing database schema', { error: initError.message });
                if (process.env.NODE_ENV === 'production') {
                    throw initError;
                }
            }
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

        registerApiRoutes({
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
        });

        // Initialize background job scheduler
        initScheduler(pool, io, broadcast);
        logger.info('Background job scheduler initialized');

        // 404 handler for undefined API routes
        app.use('/api/*', notFoundHandler);

        // Structured error handling middleware (must be after all routes)
        app.use(errorHandler);
        logger.info('Error handling middleware initialized');

    } catch (dbError) {
        const startupErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        logger.error(`Database-dependent API initialization failed: ${startupErrorMessage}`, {
            error: startupErrorMessage,
            stack: dbError instanceof Error ? dbError.stack : undefined
        });
        logger.info('Server will continue running for health checks');

        app.use('/api/*', (req, res) => {
            res.status(503).json({
                success: false,
                error: {
                    code: 'API_INITIALIZATION_FAILED',
                    message: 'API routes are unavailable because backend initialization failed. Check server startup logs.'
                }
            });
        });
    }

    // Static files and catch-all route
    app.use(express.static(path.join(__dirname, '../../frontend/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });

    logger.info('Static file serving and catch-all handler registered');
}, 500);
