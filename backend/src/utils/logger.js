/**
 * Structured Logging with Winston
 * Provides consistent logging format and request tracing
 */

const winston = require('winston');
const crypto = require('crypto');

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
    req.requestId = crypto.randomUUID();
    req.logger = logger.child({ requestId: req.requestId });
    
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
