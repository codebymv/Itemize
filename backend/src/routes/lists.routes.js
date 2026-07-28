/**
 * Lists Routes - Extracted from index.js
 * Handles all list CRUD operations and item management
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { disableConditionalCaching, sendError } = require('../utils/response');
const { listColumns } = require('./list-columns');

/**
 * Create lists routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all lists for the current user with pagination
    router.get('/lists', authenticateJWT, async (req, res) => {
        disableConditionalCaching(req, res);
        try {
            const { 
                page = 1, 
                limit = 50, 
                category,
                search 
            } = req.query;
            
            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (pageNum - 1) * limitNum;

            const data = await withDbClient(pool, async (client) => {
                // Build query with optional filters
                let whereClause = 'WHERE user_id = $1';
                const params = [req.user.id];
                let paramIndex = 2;

                if (category) {
                    whereClause += ` AND category = $${paramIndex}`;
                    params.push(category);
                    paramIndex++;
                }

                if (search) {
                    whereClause += ` AND title ILIKE $${paramIndex}`;
                    params.push(`%${search}%`);
                    paramIndex++;
                }

                // Get total count
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM lists ${whereClause}`,
                    params
                );
                const total = parseInt(countResult.rows[0].count);

                // Get paginated results
                const result = await client.query(
                    `SELECT id, title, category, items, created_at, updated_at, user_id, color_value, share_token, is_public, shared_at 
                     FROM lists ${whereClause} 
                     ORDER BY updated_at DESC 
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limitNum, offset]
                );

                return { total, result };
            });

            res.json({
                lists: data.result.rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: data.total,
                    totalPages: Math.ceil(data.total / limitNum),
                    hasNext: pageNum * limitNum < data.total,
                    hasPrev: pageNum > 1
                }
            });
        } catch (error) {
            console.error('Error fetching lists:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Create a new list
    router.post('/lists', authenticateJWT, async (req, res) => {
        try {
            const { title, category, type, items, color_value, position_x, position_y, width, height } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Title is required' });
            }

            const categoryValue = category || type || 'General';

            const result = await withDbClient(pool, async (client) => client.query(
                `INSERT INTO lists (title, category, items, user_id, color_value, position_x, position_y, width, height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${listColumns()}`,
                [
                    title,
                    categoryValue,
                    JSON.stringify(items || []),
                    req.user.id,
                    color_value || null,
                    typeof position_x === 'number' ? position_x : 0,
                    typeof position_y === 'number' ? position_y : 0,
                    width || 340,
                    height || 265
                ]
            ));

            // Map database field 'category' to frontend field 'type' for consistency
            const mappedResult = {
                ...result.rows[0],
                type: result.rows[0].category
            };

            res.status(201).json(mappedResult);
        } catch (error) {
            console.error('Error creating list:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Update a list
    router.put('/lists/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { title, category, type, items, color_value, width, height } = req.body;

            // Handle both 'category' and 'type' field names for compatibility
            const categoryValue = category || type || 'General';

            const result = await withDbClient(pool, async (client) => client.query(
                `UPDATE lists SET title = $1, category = $2, items = $3, color_value = $4, width = $5, height = $6 WHERE id = $7 AND user_id = $8 RETURNING ${listColumns()}`,
                [title, categoryValue, JSON.stringify(items), color_value, width, height, id, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found' });
            }

            // Map database field 'category' to frontend field 'type' for consistency
            const mappedResult = {
                ...result.rows[0],
                type: result.rows[0].category
            };

            // Broadcast to shared viewers if list is public
            if (result.rows[0].is_public && result.rows[0].share_token && broadcast.listUpdate) {
                broadcast.listUpdate(result.rows[0].share_token, 'LIST_UPDATE', {
                    id: result.rows[0].id,
                    title: result.rows[0].title,
                    category: result.rows[0].category,
                    items: result.rows[0].items,
                    color_value: result.rows[0].color_value,
                    updated_at: result.rows[0].updated_at
                });
            }

            // Broadcast to user's own canvas for real-time updates
            if (broadcast.userListUpdate) {
                broadcast.userListUpdate(req.user.id, 'LIST_UPDATE', mappedResult);
            }

            res.json(mappedResult);
        } catch (error) {
            console.error('Error updating list:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Delete a list
    router.delete('/lists/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;

            const result = await withDbClient(pool, async (client) => client.query(
                'DELETE FROM lists WHERE id = $1 AND user_id = $2 RETURNING id, share_token, is_public',
                [id, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found' });
            }

            // Broadcast to user's own canvas for real-time updates
            if (broadcast.userListDeleted) {
                broadcast.userListDeleted(req.user.id, { id: result.rows[0].id });
            }

            if (result.rows[0].is_public && result.rows[0].share_token && broadcast.listUpdate) {
                broadcast.listUpdate(result.rows[0].share_token, 'listDeleted', {
                    id: result.rows[0].id,
                    message: 'This list has been deleted by the owner.'
                });
            }

            res.json({ message: 'List deleted successfully' });
        } catch (error) {
            console.error('Error deleting list:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Get all lists for canvas view with positions
    router.get('/canvas/lists', authenticateJWT, async (req, res) => {
        disableConditionalCaching(req, res);
        try {
            const result = await withDbClient(pool, async (client) => client.query(
                `SELECT ${listColumns()} FROM lists WHERE user_id = $1 ORDER BY created_at DESC`,
                [req.user.id]
            ));

            // Map database field 'category' to frontend field 'type'
            const mappedLists = result.rows.map(list => ({
                ...list,
                type: list.category
            }));

            res.json(mappedLists);
        } catch (error) {
            console.error('Error fetching lists for canvas:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
