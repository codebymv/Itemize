/**
 * Base Service Class with Retry Logic and Timeout
 * Provides resilience patterns for external service calls
 */

const { logger } = require('../utils/logger');

class BaseService {
    /**
     * Create a new BaseService instance
     * @param {string} name - Service name for logging
     * @param {Object} options - Configuration options
     * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
     * @param {number} options.baseDelay - Base delay in ms for exponential backoff (default: 1000)
     * @param {number} options.timeout - Request timeout in ms (default: 30000)
     */
    constructor(name, options = {}) {
        this.name = name;
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000;
        this.timeout = options.timeout || 30000;
    }

    /**
     * Execute an operation with retry logic and timeout
     * @param {Function} operation - Async function to execute
     * @param {Object} context - Context for logging
     * @returns {Promise<any>} - Result of the operation
     */
    async withRetry(operation, context = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await Promise.race([
                    operation(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), this.timeout)
                    )
                ]);
            } catch (error) {
                lastError = error;
                
                // Don't retry on client errors (4xx except 429 Too Many Requests)
                if (error.status >= 400 && error.status < 500 && error.status !== 429) {
                    throw error;
                }
                
                // Don't retry on the last attempt
                if (attempt < this.maxRetries) {
                    // Exponential backoff with jitter
                    const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                    
                    logger.warn(`${this.name}: Retry ${attempt}/${this.maxRetries}`, { 
                        context, 
                        error: error.message,
                        nextRetryIn: `${Math.round(delay)}ms`
                    });
                    
                    await this.sleep(delay);
                }
            }
        }
        
        logger.error(`${this.name}: All retries failed`, { 
            context, 
            error: lastError.message,
            stack: lastError.stack
        });
        throw lastError;
    }

    /**
     * Execute an operation with just timeout (no retry)
     * @param {Function} operation - Async function to execute
     * @param {number} timeoutMs - Custom timeout in ms (optional)
     * @returns {Promise<any>} - Result of the operation
     */
    async withTimeout(operation, timeoutMs = this.timeout) {
        return Promise.race([
            operation(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${this.name}: Request timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * Sleep helper for delays
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log an info message with service context
     * @param {string} message - Log message
     * @param {Object} meta - Additional metadata
     */
    logInfo(message, meta = {}) {
        logger.info(`${this.name}: ${message}`, meta);
    }

    /**
     * Log an error message with service context
     * @param {string} message - Log message
     * @param {Error|Object} error - Error object or metadata
     */
    logError(message, error = {}) {
        const meta = error instanceof Error 
            ? { error: error.message, stack: error.stack }
            : error;
        logger.error(`${this.name}: ${message}`, meta);
    }

    /**
     * Log a warning message with service context
     * @param {string} message - Log message
     * @param {Object} meta - Additional metadata
     */
    logWarn(message, meta = {}) {
        logger.warn(`${this.name}: ${message}`, meta);
    }
}

module.exports = BaseService;
