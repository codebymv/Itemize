/**
 * Structured Logging with Winston
 * Provides consistent logging format and request tracing
 */

const winston = require('winston');
const crypto = require('crypto');

const acceptedRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'itemize-api' },
    transports: [
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production'
                ? winston.format.json()
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ level, message, timestamp, ...meta }) => {
                        const metaStr = Object.keys(meta).length > 0 
                            ? ` ${JSON.stringify(meta)}` 
                            : '';
                        return `${timestamp} ${level}: ${message}${metaStr}`;
                    })
                )
        })
    ]
});

/**
 * Request logging middleware
 * Adds request ID and logs request completion with timing
 */
const requestLogger = (req, res, next) => {
    const existingRequestId = typeof req.requestId === 'string' && acceptedRequestId.test(req.requestId)
        ? req.requestId
        : null;
    const suppliedRequestId = req.get('x-request-id');
    const suppliedCorrelationId = req.get('x-correlation-id');
    req.requestId = existingRequestId
        || (typeof suppliedRequestId === 'string' && acceptedRequestId.test(suppliedRequestId)
            ? suppliedRequestId
            : null)
        || (typeof suppliedCorrelationId === 'string' && acceptedRequestId.test(suppliedCorrelationId)
            ? suppliedCorrelationId
            : null)
        || crypto.randomUUID();
    req.id = req.requestId;
    req.logger = logger.child({ requestId: req.requestId });
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('x-correlation-id', req.requestId);
    
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 500 ? 'error' : 
                         res.statusCode >= 400 ? 'warn' : 'info';
        
        req.logger[logLevel]('Request completed', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.user?.id,
            organizationId: req.organizationId,
            ip: req.ip
        });
    });
    
    next();
};

module.exports = { logger, requestLogger };
