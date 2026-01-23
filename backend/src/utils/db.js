/**
 * Database Utility Functions
 * Helpers for common database operations
 */

/**
 * Execute a callback with a database client, ensuring proper release
 * Handles connection acquisition and release automatically
 * 
 * @param {Object} pool - Database connection pool
 * @param {Function} callback - Async function that receives the client
 * @returns {Promise<any>} Result of the callback
 * 
 * @example
 * const result = await withDbClient(pool, async (client) => {
 *     return await client.query('SELECT * FROM users WHERE id = $1', [userId]);
 * });
 */
async function withDbClient(pool, callback) {
    const client = await pool.connect();
    try {
        return await callback(client);
    } finally {
        client.release();
    }
}

/**
 * Execute a callback within a database transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * 
 * @param {Object} pool - Database connection pool
 * @param {Function} callback - Async function that receives the client
 * @returns {Promise<any>} Result of the callback
 * 
 * @example
 * const result = await withTransaction(pool, async (client) => {
 *     await client.query('INSERT INTO users...');
 *     await client.query('INSERT INTO user_settings...');
 *     return { success: true };
 * });
 */
async function withTransaction(pool, callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Build a paginated query result
 * 
 * @param {Object} options
 * @param {number} options.page - Current page (1-indexed)
 * @param {number} options.limit - Items per page
 * @param {number} options.total - Total count of items
 * @param {Array} options.items - Items for current page
 * @returns {Object} Paginated result with pagination metadata
 */
function buildPaginatedResult({ page, limit, total, items }) {
    return {
        data: items,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(total),
            totalPages: Math.ceil(parseInt(total) / parseInt(limit)),
            hasNext: parseInt(page) * parseInt(limit) < parseInt(total),
            hasPrev: parseInt(page) > 1
        }
    };
}

/**
 * Build a dynamic WHERE clause from filters
 * 
 * @param {Object} filters - Object with filter key-value pairs
 * @param {number} startIndex - Starting parameter index
 * @returns {Object} { whereClause: string, params: array, nextIndex: number }
 * 
 * @example
 * const { whereClause, params, nextIndex } = buildWhereClause({
 *     status: 'active',
 *     organization_id: 1
 * }, 1);
 * // whereClause: 'WHERE status = $1 AND organization_id = $2'
 * // params: ['active', 1]
 * // nextIndex: 3
 */
function buildWhereClause(filters, startIndex = 1) {
    const conditions = [];
    const params = [];
    let index = startIndex;

    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                conditions.push(`${key} = ANY($${index})`);
                params.push(value);
            } else {
                conditions.push(`${key} = $${index}`);
                params.push(value);
            }
            index++;
        }
    }

    const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';

    return { whereClause, params, nextIndex: index };
}

/**
 * Build an ORDER BY clause with validation
 * 
 * @param {string} sortBy - Column to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @param {string[]} allowedColumns - List of allowed column names
 * @param {string} defaultColumn - Default column if sortBy is invalid
 * @returns {string} ORDER BY clause
 */
function buildOrderByClause(sortBy, sortOrder = 'desc', allowedColumns = [], defaultColumn = 'created_at') {
    const column = allowedColumns.includes(sortBy) ? sortBy : defaultColumn;
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${column} ${order}`;
}

/**
 * Retry a database operation with exponential backoff
 * 
 * @param {Function} operation - Async operation to retry
 * @param {Object} options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.baseDelay - Base delay in ms
 * @returns {Promise<any>} Result of the operation
 */
async function retryOperation(operation, { maxRetries = 3, baseDelay = 100 } = {}) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Don't retry on non-transient errors
            if (error.code === '23505' || error.code === '23503') {
                throw error;
            }
            
            // Exponential backoff
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

module.exports = {
    withDbClient,
    withTransaction,
    buildPaginatedResult,
    buildWhereClause,
    buildOrderByClause,
    retryOperation
};
