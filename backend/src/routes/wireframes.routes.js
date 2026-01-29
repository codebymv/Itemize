/**
 * Wireframes Routes - React Flow diagram CRUD operations
 * Handles all wireframe/flowchart diagram operations
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../utils/response');

/**
 * Create wireframes routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all wireframes for the current user with pagination
    router.get('/wireframes', authenticateJWT, async (req, res) => {
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
                    `SELECT COUNT(*) FROM wireframes ${whereClause}`,
                    params
                );
                const total = parseInt(countResult.rows[0].count);

                const rowsResult = await client.query(
                    `SELECT id, user_id, title, category, flow_data, position_x, position_y, z_index, color_value, created_at, updated_at, share_token, is_public, shared_at 
                     FROM wireframes ${whereClause} 
                     ORDER BY updated_at DESC 
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limitNum, offset]
                );

                return { rows: rowsResult.rows, total };
            });

            sendSuccess(res, {
                wireframes: result.rows,
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
            console.error('Error fetching wireframes:', error);
            sendError(res, 'Internal server error while fetching wireframes');
        }
    });

    // Create a new wireframe
    router.post('/wireframes', authenticateJWT, async (req, res) => {
        try {
            const {
                title,
                category = 'General',
                flow_data = '{"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}',
                position_x,
                position_y,
                width = 600,
                height = 600,
                z_index = 0,
                color_value = '#3B82F6'
            } = req.body;

            if (typeof position_x !== 'number' || typeof position_y !== 'number') {
                return sendBadRequest(res, 'position_x and position_y are required and must be numbers.');
            }

            // Validate and process flow_data
            let processedFlowData;
            try {
                if (typeof flow_data === 'string') {
                    JSON.parse(flow_data);
                    processedFlowData = flow_data;
                } else {
                    const jsonString = JSON.stringify(flow_data);
                    JSON.parse(jsonString);
                    processedFlowData = jsonString;
                }
            } catch (jsonError) {
                console.error('Invalid flow data JSON on create:', jsonError, { flow_data });
                return sendBadRequest(res, 'Invalid flow data format');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `INSERT INTO wireframes (user_id, title, category, flow_data, position_x, position_y, width, height, z_index, color_value)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                    [
                        req.user.id,
                        title,
                        category,
                        processedFlowData,
                        Math.round(position_x),
                        Math.round(position_y),
                        Math.round(width),
                        Math.round(height),
                        z_index,
                        color_value
                    ]
                );
            });
            sendCreated(res, result.rows[0]);
        } catch (error) {
            console.error('Error creating wireframe:', error);
            sendError(res, 'Internal server error while creating wireframe');
        }
    });

    // Update an existing wireframe
    router.put('/wireframes/:wireframeId', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const { title, category, flow_data, position_x, position_y, width, height, z_index, color_value } = req.body;

            const result = await withDbClient(pool, async (client) => {
                const currentWireframeResult = await client.query(
                    'SELECT * FROM wireframes WHERE id = $1 AND user_id = $2',
                    [wireframeId, req.user.id]
                );

                if (currentWireframeResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const currentWireframe = currentWireframeResult.rows[0];

                const newTitle = title !== undefined ? title : currentWireframe.title;
                const newCategory = category !== undefined ? category : currentWireframe.category;

                let newFlowData = currentWireframe.flow_data;
                if (flow_data !== undefined) {
                    try {
                        if (typeof flow_data === 'string') {
                            JSON.parse(flow_data);
                            newFlowData = flow_data;
                        } else {
                            const jsonString = JSON.stringify(flow_data);
                            JSON.parse(jsonString);
                            newFlowData = jsonString;
                        }
                    } catch (jsonError) {
                        console.error('Invalid flow data JSON:', jsonError, { flow_data });
                        return { status: 'invalid_flow' };
                    }
                }

                const newPositionX = position_x !== undefined ? Math.round(position_x) : currentWireframe.position_x;
                const newPositionY = position_y !== undefined ? Math.round(position_y) : currentWireframe.position_y;
                const newWidth = width !== undefined ? Math.round(width) : currentWireframe.width;
                const newHeight = height !== undefined ? Math.round(height) : currentWireframe.height;
                const newZIndex = z_index !== undefined ? z_index : currentWireframe.z_index;
                const newColorValue = color_value !== undefined ? color_value : currentWireframe.color_value;

                const updateResult = await client.query(
                    `UPDATE wireframes
                     SET title = $1, category = $2, flow_data = $3, position_x = $4, position_y = $5, width = $6, height = $7, z_index = $8, color_value = $9, updated_at = NOW()
                     WHERE id = $10 AND user_id = $11 RETURNING *`,
                    [newTitle, newCategory, newFlowData, newPositionX, newPositionY, newWidth, newHeight, newZIndex, newColorValue, wireframeId, req.user.id]
                );

                return { status: 'ok', wireframe: updateResult.rows[0] };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Wireframe');
            }
            if (result.status === 'invalid_flow') {
                return sendBadRequest(res, 'Invalid flow data format');
            }

            const updatedWireframe = result.wireframe;

            // Broadcast to shared viewers if wireframe is public
            if (updatedWireframe.is_public && updatedWireframe.share_token && broadcast.wireframeUpdate) {
                broadcast.wireframeUpdate(updatedWireframe.share_token, 'wireframeUpdated', {
                    id: updatedWireframe.id,
                    title: updatedWireframe.title,
                    category: updatedWireframe.category,
                    flow_data: updatedWireframe.flow_data,
                    color_value: updatedWireframe.color_value,
                    updated_at: updatedWireframe.updated_at
                });
            }

            // Broadcast to user's canvas for real-time updates
            if (broadcast.userWireframeUpdate) {
                broadcast.userWireframeUpdate(req.user.id, 'WIREFRAME_UPDATED', {
                    id: updatedWireframe.id,
                    title: updatedWireframe.title,
                    category: updatedWireframe.category,
                    flow_data: updatedWireframe.flow_data,
                    color_value: updatedWireframe.color_value,
                    position_x: updatedWireframe.position_x,
                    position_y: updatedWireframe.position_y,
                    width: updatedWireframe.width,
                    height: updatedWireframe.height,
                    updated_at: updatedWireframe.updated_at
                });
            }

            sendSuccess(res, updatedWireframe);
        } catch (error) {
            console.error('Error updating wireframe:', error);
            sendError(res, 'Internal server error while updating wireframe');
        }
    });

    // Update wireframe position only
    router.put('/wireframes/:id/position', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { x, y } = req.body;

            if (typeof x !== 'number' || typeof y !== 'number') {
                return sendBadRequest(res, 'Invalid position coordinates');
            }

            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    'UPDATE wireframes SET position_x = $1, position_y = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
                    [Math.round(x), Math.round(y), id, req.user.id]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Wireframe');
            }

            // Broadcast position update to shared viewers if wireframe is public
            if (result.rows[0].is_public && result.rows[0].share_token && broadcast.wireframeUpdate) {
                broadcast.wireframeUpdate(result.rows[0].share_token, 'POSITION_UPDATE', {
                    id: result.rows[0].id,
                    position_x: result.rows[0].position_x,
                    position_y: result.rows[0].position_y
                });
            }

            // Broadcast position update to user's canvas
            if (broadcast.userWireframeUpdate) {
                broadcast.userWireframeUpdate(req.user.id, 'POSITION_UPDATE', {
                    id: result.rows[0].id,
                    position_x: result.rows[0].position_x,
                    position_y: result.rows[0].position_y
                });
            }

            sendSuccess(res, result.rows[0]);
        } catch (error) {
            console.error('Error updating wireframe position:', error);
            sendError(res, 'Internal server error');
        }
    });

    // Delete a wireframe
    router.delete('/wireframes/:wireframeId', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id, title, share_token, is_public FROM wireframes WHERE id = $1 AND user_id = $2',
                    [wireframeId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const wireframeInfo = checkResult.rows[0];
                console.log(`🗑️ Deleting wireframe ${wireframeId} (${wireframeInfo.title}).`);

                const deleteResult = await client.query(
                    'DELETE FROM wireframes WHERE id = $1 AND user_id = $2 RETURNING id',
                    [wireframeId, req.user.id]
                );

                return { status: 'ok', info: wireframeInfo, result: deleteResult };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Wireframe');
            }
            if (result.result.rows.length === 0) {
                return sendNotFound(res, 'Wireframe');
            }

            // Broadcast deletion to shared viewers if wireframe was public
            if (result.info.is_public && result.info.share_token && broadcast.wireframeUpdate) {
                broadcast.wireframeUpdate(result.info.share_token, 'wireframeDeleted', {
                    id: result.info.id,
                    message: 'This wireframe has been deleted by the owner.'
                });
            }

            console.log(`✅ Wireframe ${wireframeId} deleted successfully.`);
            sendSuccess(res, { message: 'Wireframe deleted successfully' });
        } catch (error) {
            console.error('Error deleting wireframe:', error);
            sendError(res, 'Internal server error while deleting wireframe');
        }
    });

    // Share a wireframe (generate share token)
    router.post('/wireframes/:wireframeId/share', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id, share_token, is_public FROM wireframes WHERE id = $1 AND user_id = $2',
                    [wireframeId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const existingWireframe = checkResult.rows[0];

                if (existingWireframe.is_public && existingWireframe.share_token) {
                    return { status: 'already_shared', token: existingWireframe.share_token };
                }

                const updateResult = await client.query(
                    `UPDATE wireframes 
                     SET share_token = gen_random_uuid(), is_public = TRUE, shared_at = NOW(), updated_at = NOW()
                     WHERE id = $1 AND user_id = $2 
                     RETURNING share_token`,
                    [wireframeId, req.user.id]
                );

                return { status: 'ok', token: updateResult.rows[0].share_token };
            });

            if (result.status === 'not_found') {
                return sendNotFound(res, 'Wireframe');
            }

            if (result.status === 'already_shared') {
                return sendSuccess(res, {
                    shareToken: result.token,
                    shareUrl: `${req.protocol}://${req.get('host')}/shared/wireframe/${result.token}`
                });
            }

            const shareToken = result.token;
            sendSuccess(res, {
                shareToken,
                shareUrl: `${req.protocol}://${req.get('host')}/shared/wireframe/${shareToken}`
            });
        } catch (error) {
            console.error('Error sharing wireframe:', error);
            sendError(res, 'Internal server error while sharing wireframe');
        }
    });

    // Unshare a wireframe (revoke share token)
    router.delete('/wireframes/:wireframeId/share', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const result = await withDbClient(pool, async (client) => {
                return client.query(
                    `UPDATE wireframes 
                     SET is_public = FALSE, updated_at = NOW()
                     WHERE id = $1 AND user_id = $2 
                     RETURNING id`,
                    [wireframeId, req.user.id]
                );
            });

            if (result.rows.length === 0) {
                return sendNotFound(res, 'Wireframe');
            }

            sendSuccess(res, { message: 'Wireframe sharing disabled successfully' });
        } catch (error) {
            console.error('Error unsharing wireframe:', error);
            sendError(res, 'Internal server error while unsharing wireframe');
        }
    });

    return router;
};
