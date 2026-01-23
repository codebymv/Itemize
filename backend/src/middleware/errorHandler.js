/**
 * Structured Error Handling Middleware
 * Provides consistent error responses and better debugging
 */

/**
 * Custom application error class
 * Use this to throw errors with specific status codes and error codes
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true; // Distinguishes from programming errors
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Common error factory functions
 */
const errors = {
    badRequest: (message = 'Bad request', code = 'BAD_REQUEST') => 
        new AppError(message, 400, code),
    
    unauthorized: (message = 'Unauthorized', code = 'UNAUTHORIZED') => 
        new AppError(message, 401, code),
    
    forbidden: (message = 'Forbidden', code = 'FORBIDDEN') => 
        new AppError(message, 403, code),
    
    notFound: (message = 'Resource not found', code = 'NOT_FOUND') => 
        new AppError(message, 404, code),
    
    conflict: (message = 'Conflict', code = 'CONFLICT') => 
        new AppError(message, 409, code),
    
    tooManyRequests: (message = 'Too many requests', code = 'RATE_LIMITED') => 
        new AppError(message, 429, code),
    
    internal: (message = 'Internal server error', code = 'INTERNAL_ERROR') => 
        new AppError(message, 500, code),
    
    dbError: (message = 'Database error', originalError = null) => {
        const error = new AppError(message, 500, 'DATABASE_ERROR');
        error.originalError = originalError;
        return error;
    },
    
    validationError: (message, field = null) => {
        const error = new AppError(message, 400, 'VALIDATION_ERROR');
        error.field = field;
        return error;
    }
};

/**
 * Error handler middleware
 * Place at the end of middleware chain to catch all errors
 */
const errorHandler = (err, req, res, next) => {
    // Log error details
    const errorLog = {
        message: err.message,
        code: err.code || 'UNKNOWN',
        statusCode: err.statusCode || 500,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    };

    // In development, include stack trace
    if (process.env.NODE_ENV !== 'production') {
        errorLog.stack = err.stack;
    }

    console.error('Error:', JSON.stringify(errorLog, null, 2));

    // Determine status code
    let statusCode = err.statusCode || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = err.message || 'Something went wrong';

    // Handle specific error types
    if (err.code === '23505') { // PostgreSQL unique violation
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'A record with this value already exists';
    } else if (err.code === '23503') { // PostgreSQL foreign key violation
        statusCode = 400;
        code = 'REFERENCE_ERROR';
        message = 'Referenced record does not exist';
    } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        code = 'INVALID_TOKEN';
        message = 'Invalid authentication token';
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        code = 'TOKEN_EXPIRED';
        message = 'Authentication token has expired';
    } else if (err.type === 'entity.too.large') {
        statusCode = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Request payload is too large';
    }

    // Don't expose internal error details in production
    if (statusCode === 500 && process.env.NODE_ENV === 'production' && !err.isOperational) {
        message = 'Internal server error';
    }

    // Send response
    const response = {
        error: {
            message,
            code
        }
    };

    // Include field info for validation errors
    if (err.field) {
        response.error.field = err.field;
    }

    // Include stack trace in development
    if (process.env.NODE_ENV !== 'production') {
        response.error.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not found handler for undefined routes
 * Place after all route definitions
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Route ${req.method} ${req.path} not found`, 404, 'ROUTE_NOT_FOUND');
    next(error);
};

module.exports = {
    AppError,
    errors,
    errorHandler,
    asyncHandler,
    notFoundHandler
};
