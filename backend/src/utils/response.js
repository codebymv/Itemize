/**
 * API Response Utilities
 * Standardizes API response formats across all endpoints
 */

/**
 * Send a successful response with data
 * 
 * @param {Object} res - Express response object
 * @param {any} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data, statusCode = 200) {
    res.status(statusCode).json({
        success: true,
        data
    });
}

/**
 * Send a successful response with pagination
 * 
 * @param {Object} res - Express response object
 * @param {Array} items - Array of items
 * @param {Object} pagination - Pagination metadata
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendPaginated(res, items, pagination, statusCode = 200) {
    res.status(statusCode).json({
        success: true,
        data: items,
        pagination
    });
}

/**
 * Send an error response
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} code - Error code (default: 'ERROR')
 */
function sendError(res, message, statusCode = 500, code = 'ERROR') {
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code
        }
    });
}

/**
 * Send a 400 Bad Request error
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} field - Optional field name for validation errors
 */
function sendBadRequest(res, message, field = null) {
    const response = {
        success: false,
        error: {
            message,
            code: 'BAD_REQUEST'
        }
    };
    
    if (field) {
        response.error.field = field;
    }
    
    res.status(400).json(response);
}

/**
 * Send a 404 Not Found error
 * 
 * @param {Object} res - Express response object
 * @param {string} resource - Name of the resource not found
 */
function sendNotFound(res, resource = 'Resource') {
    res.status(404).json({
        success: false,
        error: {
            message: `${resource} not found`,
            code: 'NOT_FOUND'
        }
    });
}

/**
 * Send a 401 Unauthorized error
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendUnauthorized(res, message = 'Unauthorized') {
    res.status(401).json({
        success: false,
        error: {
            message,
            code: 'UNAUTHORIZED'
        }
    });
}

/**
 * Send a 403 Forbidden error
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function sendForbidden(res, message = 'Forbidden') {
    res.status(403).json({
        success: false,
        error: {
            message,
            code: 'FORBIDDEN'
        }
    });
}

/**
 * Send a 201 Created response
 * 
 * @param {Object} res - Express response object
 * @param {any} data - Created resource data
 */
function sendCreated(res, data) {
    res.status(201).json({
        success: true,
        data
    });
}

/**
 * Send a 204 No Content response
 * 
 * @param {Object} res - Express response object
 */
function sendNoContent(res) {
    res.status(204).send();
}

/**
 * Wrap pagination parameters
 * 
 * @param {Object} query - Request query parameters
 * @param {Object} defaults - Default values
 * @returns {Object} Pagination parameters
 */
function getPaginationParams(query, defaults = { page: 1, limit: 50, maxLimit: 100 }) {
    const page = Math.max(1, parseInt(query.page) || defaults.page);
    const limit = Math.min(
        defaults.maxLimit,
        Math.max(1, parseInt(query.limit) || defaults.limit)
    );
    const offset = (page - 1) * limit;
    
    return { page, limit, offset };
}

/**
 * Build pagination metadata
 * 
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total count
 * @returns {Object} Pagination metadata
 */
function buildPagination(page, limit, total) {
    const totalPages = Math.ceil(total / limit);
    
    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
}

module.exports = {
    sendSuccess,
    sendPaginated,
    sendError,
    sendBadRequest,
    sendNotFound,
    sendUnauthorized,
    sendForbidden,
    sendCreated,
    sendNoContent,
    getPaginationParams,
    buildPagination
};
