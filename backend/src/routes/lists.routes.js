/**
 * Lists Routes - Extracted from index.js
 * Handles all list CRUD operations and item management
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * Create lists routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all lists for the current user
    router.get('/lists', authenticateJWT, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT id, title, category, items, created_at, updated_at, user_id, color_value, share_token, is_public, shared_at FROM lists WHERE user_id = $1 ORDER BY id DESC',
                [req.user.id]
            );
            client.release();
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching lists:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create a new list
    router.post('/lists', authenticateJWT, async (req, res) => {
        try {
            const { title, category, type, items, color_value, position_x, position_y, width, height } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Title is required' });
            }

            // Handle both 'category' and 'type' field names for compatibility
            const categoryValue = category || type || 'General';

            const client = await pool.connect();
            const result = await client.query(
                'INSERT INTO lists (title, category, items, user_id, color_value, position_x, position_y, width, height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
                [
                    title,
                    categoryValue,
                    JSON.stringify(items || []),
                    req.user.id,
                    color_value || null,
                    position_x || 0,
                    position_y || 0,
                    width || 340,
                    height || 265
                ]
            );
            client.release();

            // Map database field 'category' to frontend field 'type' for consistency
            const mappedResult = {
                ...result.rows[0],
                type: result.rows[0].category
            };

            res.status(201).json(mappedResult);
        } catch (error) {
            console.error('Error creating list:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update a list
    router.put('/lists/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { title, category, type, items, color_value, width, height } = req.body;

            // Handle both 'category' and 'type' field names for compatibility
            const categoryValue = category || type || 'General';

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE lists SET title = $1, category = $2, items = $3, color_value = $4, width = $5, height = $6 WHERE id = $7 AND user_id = $8 RETURNING *',
                [title, categoryValue, JSON.stringify(items), color_value, width, height, id, req.user.id]
            );
            client.release();

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
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete a list
    router.delete('/lists/:id', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;

            const client = await pool.connect();
            const result = await client.query(
                'DELETE FROM lists WHERE id = $1 AND user_id = $2 RETURNING id',
                [id, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found' });
            }

            // Broadcast to user's own canvas for real-time updates
            if (broadcast.userListDeleted) {
                broadcast.userListDeleted(req.user.id, { id: result.rows[0].id });
            }

            res.json({ message: 'List deleted successfully' });
        } catch (error) {
            console.error('Error deleting list:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get all lists for canvas view with positions
    router.get('/canvas/lists', authenticateJWT, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
                [req.user.id]
            );
            client.release();

            // Map database field 'category' to frontend field 'type'
            const mappedLists = result.rows.map(list => ({
                ...list,
                type: list.category
            }));

            res.json(mappedLists);
        } catch (error) {
            console.error('Error fetching lists for canvas:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update list position for canvas view
    router.put('/lists/:id/position', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { x, y } = req.body;

            if (typeof x !== 'number' || typeof y !== 'number') {
                return res.status(400).json({ error: 'Invalid position coordinates' });
            }

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE lists SET position_x = $1, position_y = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
                [x, y, id, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found' });
            }

            // Broadcast position update to shared viewers if list is public
            if (result.rows[0].is_public && result.rows[0].share_token && broadcast.listUpdate) {
                broadcast.listUpdate(result.rows[0].share_token, 'POSITION_UPDATE', {
                    id: result.rows[0].id,
                    position_x: result.rows[0].position_x,
                    position_y: result.rows[0].position_y
                });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating list position:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Toggle item completion status
    router.put('/lists/:id/items/:itemId/toggle', authenticateJWT, async (req, res) => {
        try {
            const { id, itemId } = req.params;

            const client = await pool.connect();

            // Get current list
            const listResult = await client.query(
                'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
                [id, req.user.id]
            );

            if (listResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'List not found' });
            }

            const list = listResult.rows[0];
            const items = list.items || [];

            // Find and toggle the item
            const itemIndex = items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) {
                client.release();
                return res.status(404).json({ error: 'Item not found' });
            }

            items[itemIndex].completed = !items[itemIndex].completed;

            // Update the list
            const updateResult = await client.query(
                'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [JSON.stringify(items), id, req.user.id]
            );
            client.release();

            const updatedList = updateResult.rows[0];

            // Broadcast to shared viewers if list is public
            if (updatedList.is_public && updatedList.share_token && broadcast.listUpdate) {
                broadcast.listUpdate(updatedList.share_token, 'ITEM_TOGGLED', {
                    id: updatedList.id,
                    itemId: itemId,
                    completed: items[itemIndex].completed,
                    items: updatedList.items
                });
            }

            // Broadcast to user's own canvas for real-time updates
            const mappedResult = {
                ...updatedList,
                type: updatedList.category
            };
            if (broadcast.userListUpdate) {
                broadcast.userListUpdate(req.user.id, 'ITEM_TOGGLED', mappedResult);
            }

            res.json(mappedResult);
        } catch (error) {
            console.error('Error toggling item:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Add new item to list
    router.post('/lists/:id/items', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { text, completed = false } = req.body;

            if (!text || text.trim() === '') {
                return res.status(400).json({ error: 'Item text is required' });
            }

            const client = await pool.connect();

            // Get current list
            const listResult = await client.query(
                'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
                [id, req.user.id]
            );

            if (listResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'List not found' });
            }

            const list = listResult.rows[0];
            const items = list.items || [];

            // Create new item
            const newItem = {
                id: crypto.randomUUID(),
                text: text.trim(),
                completed: completed
            };

            items.push(newItem);

            // Update the list
            const updateResult = await client.query(
                'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [JSON.stringify(items), id, req.user.id]
            );
            client.release();

            const updatedList = updateResult.rows[0];

            // Broadcast to shared viewers if list is public
            if (updatedList.is_public && updatedList.share_token && broadcast.listUpdate) {
                broadcast.listUpdate(updatedList.share_token, 'ITEM_ADDED', {
                    id: updatedList.id,
                    newItem: newItem,
                    items: updatedList.items
                });
            }

            // Broadcast to user's own canvas for real-time updates
            const mappedResult = {
                ...updatedList,
                type: updatedList.category
            };
            if (broadcast.userListUpdate) {
                broadcast.userListUpdate(req.user.id, 'ITEM_ADDED', mappedResult);
            }

            res.json(mappedResult);
        } catch (error) {
            console.error('Error adding item:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Remove item from list
    router.delete('/lists/:id/items/:itemId', authenticateJWT, async (req, res) => {
        try {
            const { id, itemId } = req.params;

            const client = await pool.connect();

            // Get current list
            const listResult = await client.query(
                'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
                [id, req.user.id]
            );

            if (listResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'List not found' });
            }

            const list = listResult.rows[0];
            const items = list.items || [];

            // Find and remove the item
            const itemIndex = items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) {
                client.release();
                return res.status(404).json({ error: 'Item not found' });
            }

            items.splice(itemIndex, 1);

            // Update the list
            const updateResult = await client.query(
                'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [JSON.stringify(items), id, req.user.id]
            );
            client.release();

            const updatedList = updateResult.rows[0];

            // Broadcast to shared viewers if list is public
            if (updatedList.is_public && updatedList.share_token && broadcast.listUpdate) {
                broadcast.listUpdate(updatedList.share_token, 'ITEM_REMOVED', {
                    id: updatedList.id,
                    removedItemId: itemId,
                    items: updatedList.items
                });
            }

            res.json({
                ...updatedList,
                type: updatedList.category
            });
        } catch (error) {
            console.error('Error removing item:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update list title
    router.put('/lists/:id/title', authenticateJWT, async (req, res) => {
        try {
            const { id } = req.params;
            const { title } = req.body;

            if (!title || title.trim() === '') {
                return res.status(400).json({ error: 'Title is required' });
            }

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE lists SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [title.trim(), id, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found' });
            }

            const updatedList = result.rows[0];

            // Broadcast to shared viewers if list is public
            if (updatedList.is_public && updatedList.share_token && broadcast.listUpdate) {
                broadcast.listUpdate(updatedList.share_token, 'TITLE_CHANGED', {
                    id: updatedList.id,
                    title: updatedList.title
                });
            }

            res.json({
                ...updatedList,
                type: updatedList.category
            });
        } catch (error) {
            console.error('Error updating title:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
