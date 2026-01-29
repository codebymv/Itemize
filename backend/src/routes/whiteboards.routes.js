/**
 * Whiteboards Routes - Extracted from index.js
 * Handles all whiteboard CRUD operations
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');

/**
 * Create whiteboards routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all whiteboards for the current user with pagination
    router.get('/whiteboards', authenticateJWT, async (req, res) => {
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

            const result = await withDbClient(pool, async (client) => {
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

                const countResult = await client.query(
                    `SELECT COUNT(*) FROM whiteboards ${whereClause}`,
                    params
                );
                const total = parseInt(countResult.rows[0].count);

                const rowsResult = await client.query(
                    `SELECT id, user_id, title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value, created_at, updated_at, share_token, is_public, shared_at 
                     FROM whiteboards ${whereClause} 
                     ORDER BY updated_at DESC 
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limitNum, offset]
                );

                return { rows: rowsResult.rows, total };
            });

            sendSuccess(res, {
                whiteboards: result.rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: result.total,
                    totalPages: Math.ceil(result.total / limitNum),
                    hasNext: pageNum * limitNum < result.total,
                    hasPrev: pageNum > 1
                }
            });
        } catch (error) {
            console.error('Error fetching whiteboards:', error);
            sendError(res, 'Internal server error while fetching whiteboards');
        }
    });

    // Create a new whiteboard
    router.post('/whiteboards', authenticateJWT, async (req, res) => {
        try {
            const {
                title,
                category = 'General',
                canvas_data = '{"paths": [], "shapes": []}',
                canvas_width,
                canvas_height,
                background_color = '#FFFFFF',
                position_x,
                position_y,
                z_index = 0,
                color_value = '#3B82F6'
            } = req.body;

            if (typeof position_x !== 'number' || typeof position_y !== 'number') {
                return sendBadRequest(res, 'position_x and position_y are required and must be numbers.');
            }

            // Validate and process canvas_data
            let processedCanvasData;
            try {
                if (typeof canvas_data === 'string') {
                    JSON.parse(canvas_data);
                    processedCanvasData = canvas_data;
                } else {
                    const jsonString = JSON.stringify(canvas_data);
                    JSON.parse(jsonString);
                    processedCanvasData = jsonString;
                }
            } catch (jsonError) {
                console.error('Invalid canvas data JSON on create:', jsonError, { canvas_data });
                return sendBadRequest(res, 'Invalid canvas data format');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `INSERT INTO whiteboards (user_id, title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
                    [
                        req.user.id,
                        title,
                        category,
                        processedCanvasData,
                        canvas_width,
                        canvas_height,
                        background_color,
                        position_x,
                        position_y,
                        z_index,
                        color_value
                    ]
                );
            });
            sendCreated(res, result.rows[0]);
        } catch (error) {
            console.error('Error creating whiteboard:', error);
            sendError(res, 'Internal server error while creating whiteboard');
        }
    });

    // Update an existing whiteboard
    router.put('/whiteboards/:whiteboardId', authenticateJWT, async (req, res) => {
        try {
            const { whiteboardId } = req.params;
            const { title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value } = req.body;

            const result = await withDbClient(pool, async (client) => {
                const currentWhiteboardResult = await client.query(
                    'SELECT * FROM whiteboards WHERE id = $1 AND user_id = $2',
                    [whiteboardId, req.user.id]
                );

                if (currentWhiteboardResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const currentWhiteboard = currentWhiteboardResult.rows[0];

                const newTitle = title !== undefined ? title : currentWhiteboard.title;
                const newCategory = category !== undefined ? category : currentWhiteboard.category;

                let newCanvasData = currentWhiteboard.canvas_data;
                if (canvas_data !== undefined) {
                    try {
                        if (typeof canvas_data === 'string') {
                            JSON.parse(canvas_data);
                            newCanvasData = canvas_data;
                        } else {
                            const jsonString = JSON.stringify(canvas_data);
                            JSON.parse(jsonString);
                            newCanvasData = jsonString;
                        }
                    } catch (jsonError) {
                        console.error('Invalid canvas data JSON:', jsonError, { canvas_data });
                        return { status: 'invalid_canvas' };
                    }
                }

                const newCanvasWidth = canvas_width !== undefined ? canvas_width : currentWhiteboard.canvas_width;
                const newCanvasHeight = canvas_height !== undefined ? canvas_height : currentWhiteboard.canvas_height;
                const newBackgroundColor = background_color !== undefined ? background_color : currentWhiteboard.background_color;
                const newPositionX = position_x !== undefined ? position_x : currentWhiteboard.position_x;
                const newPositionY = position_y !== undefined ? position_y : currentWhiteboard.position_y;
                const newZIndex = z_index !== undefined ? z_index : currentWhiteboard.z_index;
                const newColorValue = color_value !== undefined ? color_value : currentWhiteboard.color_value;

                const updateResult = await client.query(
                    `UPDATE whiteboards
         SET title = $1, category = $2, canvas_data = $3, canvas_width = $4, canvas_height = $5, background_color = $6, position_x = $7, position_y = $8, z_index = $9, color_value = $10
         WHERE id = $11 AND user_id = $12 RETURNING *`,
                    [newTitle, newCategory, newCanvasData, newCanvasWidth, newCanvasHeight, newBackgroundColor, newPositionX, newPositionY, newZIndex, newColorValue, whiteboardId, req.user.id]
                );

                return { status: 'ok', whiteboard: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Whiteboard');
            }
            if (result.status === 'invalid_canvas') {
                return sendBadRequest(res, 'Invalid canvas data format');
            }

            const updatedWhiteboard = result.whiteboard;

            // Broadcast to shared viewers if whiteboard is public
            if (updatedWhiteboard.is_public && updatedWhiteboard.share_token && broadcast.whiteboardUpdate) {
                broadcast.whiteboardUpdate(updatedWhiteboard.share_token, 'whiteboardUpdated', {
                    id: updatedWhiteboard.id,
                    title: updatedWhiteboard.title,
                    category: updatedWhiteboard.category,
                    canvas_data: updatedWhiteboard.canvas_data,
                    canvas_width: updatedWhiteboard.canvas_width,
                    canvas_height: updatedWhiteboard.canvas_height,
                    background_color: updatedWhiteboard.background_color,
                    color_value: updatedWhiteboard.color_value,
                    updated_at: updatedWhiteboard.updated_at
                });
            }

            sendSuccess(res, updatedWhiteboard);
        } catch (error) {
            console.error('Error updating whiteboard:', error);
            sendError(res, 'Internal server error while updating whiteboard');
        }
    });

    // Update whiteboard position only
    router.put('/whiteboards/:id/position', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { x, y } = req.body;

            if (typeof x !== 'number' || typeof y !== 'number') {
                return sendBadRequest(res, 'Invalid position coordinates');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'UPDATE whiteboards SET position_x = $1, position_y = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
                    [x, y, id, req.user.id]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Whiteboard');
            }

            // Broadcast position update to shared viewers if whiteboard is public
            if (result.rows[0].is_public && result.rows[0].share_token && broadcast.whiteboardUpdate) {
                broadcast.whiteboardUpdate(result.rows[0].share_token, 'POSITION_UPDATE', {
                    id: result.rows[0].id,
                    position_x: result.rows[0].position_x,
                    position_y: result.rows[0].position_y
                });
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error updating whiteboard position:', error);
            sendError(res, 'Internal server error');
        }
    });

    // Delete a whiteboard
    router.delete('/whiteboards/:whiteboardId', authenticateJWT, async (req, res) => {
        try {
            const { whiteboardId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id, title, share_token, is_public FROM whiteboards WHERE id = $1 AND user_id = $2',
                    [whiteboardId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const whiteboardInfo = checkResult.rows[0];
                console.log(`🗑️ Deleting whiteboard ${whiteboardId} (${whiteboardInfo.title}).`);

                const deleteResult = await client.query(
                    'DELETE FROM whiteboards WHERE id = $1 AND user_id = $2 RETURNING id',
                    [whiteboardId, req.user.id]
                );

                return { status: 'ok', info: whiteboardInfo, result: deleteResult };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Whiteboard');
            }

            if (result.result.rows.length === 0) {
                return sendNotFound(res, 'Whiteboard');
            }

            if (result.info.is_public && result.info.share_token && broadcast.whiteboardUpdate) {
                broadcast.whiteboardUpdate(result.info.share_token, 'whiteboardDeleted', {
                    id: result.info.id,
                    message: 'This whiteboard has been deleted by the owner.'
                });
            }

            console.log(`✅ Whiteboard ${whiteboardId} deleted successfully.`);
            sendSuccess(res, { message: 'Whiteboard deleted successfully' });
        } catch (error) {
            console.error('Error deleting whiteboard:', error);
            sendError(res, 'Internal server error while deleting whiteboard');
        }
    });

    return router;
};
