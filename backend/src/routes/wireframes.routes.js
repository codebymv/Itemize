/**
 * Wireframes Routes - React Flow diagram CRUD operations
 * Handles all wireframe/flowchart diagram operations
 */
const express = require('express');
const router = express.Router();

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

            const client = await pool.connect();
            
            try {
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
                    `SELECT COUNT(*) FROM wireframes ${whereClause}`,
                    params
                );
                const total = parseInt(countResult.rows[0].count);

                // Get paginated results
                const result = await client.query(
                    `SELECT id, user_id, title, category, flow_data, position_x, position_y, z_index, color_value, created_at, updated_at, share_token, is_public, shared_at 
                     FROM wireframes ${whereClause} 
                     ORDER BY updated_at DESC 
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limitNum, offset]
                );

                res.json({
                    wireframes: result.rows,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        totalPages: Math.ceil(total / limitNum),
                        hasNext: pageNum * limitNum < total,
                        hasPrev: pageNum > 1
                    }
                });
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error fetching wireframes:', error);
            res.status(500).json({ error: 'Internal server error while fetching wireframes' });
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
                return res.status(400).json({ error: 'position_x and position_y are required and must be numbers.' });
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
                return res.status(400).json({ error: 'Invalid flow data format' });
            }

            const client = await pool.connect();
            const result = await client.query(
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
            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating wireframe:', error);
            res.status(500).json({ error: 'Internal server error while creating wireframe' });
        }
    });

    // Update an existing wireframe
    router.put('/wireframes/:wireframeId', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const { title, category, flow_data, position_x, position_y, width, height, z_index, color_value } = req.body;

            const client = await pool.connect();
            const currentWireframeResult = await client.query('SELECT * FROM wireframes WHERE id = $1 AND user_id = $2', [wireframeId, req.user.id]);

            if (currentWireframeResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Wireframe not found or access denied' });
            }

            const currentWireframe = currentWireframeResult.rows[0];

            const newTitle = title !== undefined ? title : currentWireframe.title;
            const newCategory = category !== undefined ? category : currentWireframe.category;

            // Properly handle flow_data with validation
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
                    client.release();
                    return res.status(400).json({ error: 'Invalid flow data format' });
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
            client.release();

            const updatedWireframe = updateResult.rows[0];

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

            res.json(updatedWireframe);
        } catch (error) {
            console.error('Error updating wireframe:', error);
            res.status(500).json({ error: 'Internal server error while updating wireframe' });
        }
    });

    // Update wireframe position only
    router.put('/wireframes/:id/position', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { x, y } = req.body;

            if (typeof x !== 'number' || typeof y !== 'number') {
                return res.status(400).json({ error: 'Invalid position coordinates' });
            }

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE wireframes SET position_x = $1, position_y = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
                [Math.round(x), Math.round(y), id, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Wireframe not found' });
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

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating wireframe position:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete a wireframe
    router.delete('/wireframes/:wireframeId', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const client = await pool.connect();

            const checkResult = await client.query(
                'SELECT id, title, share_token, is_public FROM wireframes WHERE id = $1 AND user_id = $2',
                [wireframeId, req.user.id]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Wireframe not found or access denied' });
            }

            const wireframeInfo = checkResult.rows[0];
            console.log(`🗑️ Deleting wireframe ${wireframeId} (${wireframeInfo.title}).`);

            const result = await client.query(
                'DELETE FROM wireframes WHERE id = $1 AND user_id = $2 RETURNING id',
                [wireframeId, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Wireframe not found or access denied' });
            }

            // Broadcast deletion to shared viewers if wireframe was public
            if (wireframeInfo.is_public && wireframeInfo.share_token && broadcast.wireframeUpdate) {
                broadcast.wireframeUpdate(wireframeInfo.share_token, 'wireframeDeleted', {
                    id: wireframeInfo.id,
                    message: 'This wireframe has been deleted by the owner.'
                });
            }

            console.log(`✅ Wireframe ${wireframeId} deleted successfully.`);
            res.status(200).json({ message: 'Wireframe deleted successfully' });
        } catch (error) {
            console.error('Error deleting wireframe:', error);
            res.status(500).json({ error: 'Internal server error while deleting wireframe' });
        }
    });

    // Share a wireframe (generate share token)
    router.post('/wireframes/:wireframeId/share', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const client = await pool.connect();

            // Verify ownership
            const checkResult = await client.query(
                'SELECT id, share_token, is_public FROM wireframes WHERE id = $1 AND user_id = $2',
                [wireframeId, req.user.id]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Wireframe not found or access denied' });
            }

            const existingWireframe = checkResult.rows[0];

            // If already shared, return existing token
            if (existingWireframe.is_public && existingWireframe.share_token) {
                client.release();
                return res.json({
                    shareToken: existingWireframe.share_token,
                    shareUrl: `${req.protocol}://${req.get('host')}/shared/wireframe/${existingWireframe.share_token}`
                });
            }

            // Generate new share token
            const result = await client.query(
                `UPDATE wireframes 
                 SET share_token = gen_random_uuid(), is_public = TRUE, shared_at = NOW(), updated_at = NOW()
                 WHERE id = $1 AND user_id = $2 
                 RETURNING share_token`,
                [wireframeId, req.user.id]
            );
            client.release();

            const shareToken = result.rows[0].share_token;
            res.json({
                shareToken,
                shareUrl: `${req.protocol}://${req.get('host')}/shared/wireframe/${shareToken}`
            });
        } catch (error) {
            console.error('Error sharing wireframe:', error);
            res.status(500).json({ error: 'Internal server error while sharing wireframe' });
        }
    });

    // Unshare a wireframe (revoke share token)
    router.delete('/wireframes/:wireframeId/share', authenticateJWT, async (req, res) => {
        try {
            const { wireframeId } = req.params;
            const client = await pool.connect();

            const result = await client.query(
                `UPDATE wireframes 
                 SET is_public = FALSE, updated_at = NOW()
                 WHERE id = $1 AND user_id = $2 
                 RETURNING id`,
                [wireframeId, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Wireframe not found or access denied' });
            }

            res.json({ message: 'Wireframe sharing disabled successfully' });
        } catch (error) {
            console.error('Error unsharing wireframe:', error);
            res.status(500).json({ error: 'Internal server error while unsharing wireframe' });
        }
    });

    return router;
};
