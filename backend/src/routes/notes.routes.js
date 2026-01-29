/**
 * Notes Routes - Extracted from index.js
 * Handles all note CRUD operations
 */
const express = require('express');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');

/**
 * Create notes routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all notes for the current user with pagination
    router.get('/notes', authenticateJWT, async (req, res) => {
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
                    whereClause += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
                    params.push(`%${search}%`);
                    paramIndex++;
                }

                // Get total count
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM notes ${whereClause}`,
                    params
                );
                const total = parseInt(countResult.rows[0].count);

                // Get paginated results
                const result = await client.query(
                    `SELECT id, user_id, title, content, category, color_value, position_x, position_y, width, height, z_index, created_at, updated_at, share_token, is_public, shared_at 
                     FROM notes ${whereClause} 
                     ORDER BY updated_at DESC 
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limitNum, offset]
                );

                return { total, result };
            });

            res.json({
                notes: data.result.rows,
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
            console.error('Error fetching notes:', error);
            return sendError(res, 'Internal server error while fetching notes');
        }
    });

    // Create a new note
    router.post('/notes', authenticateJWT, async (req, res) => {
        try {
            const {
                title,
                content = '',
                category = 'General',
                position_x,
                position_y,
                width,
                height,
                z_index = 0,
                color_value = '#3B82F6'
            } = req.body;

            if (typeof position_x !== 'number' || typeof position_y !== 'number') {
                return res.status(400).json({ error: 'position_x and position_y are required and must be numbers.' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                `INSERT INTO notes (user_id, title, content, category, color_value, position_x, position_y, width, height, z_index) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                [
                    req.user.id,
                    title,
                    content,
                    category,
                    color_value,
                    position_x,
                    position_y,
                    width,
                    height,
                    z_index
                ]
            ));
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating note:', error);
            return sendError(res, 'Internal server error while creating note');
        }
    });

    // Update an existing note
    router.put('/notes/:noteId', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const { title, content, category, color_value, position_x, position_y, width, height, z_index } = req.body;

            const data = await withDbClient(pool, async (client) => {
                const currentNoteResult = await client.query('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [noteId, req.user.id]);

                if (currentNoteResult.rows.length === 0) {
                    return { status: 404, payload: { error: 'Note not found or access denied' } };
                }

                const currentNote = currentNoteResult.rows[0];

                const newTitle = title !== undefined ? title : currentNote.title;
                const newContent = content !== undefined ? content : currentNote.content;
                const newCategory = category !== undefined ? category : currentNote.category;
                const newColorValue = color_value !== undefined ? color_value : currentNote.color_value;
                const newPositionX = position_x !== undefined ? position_x : currentNote.position_x;
                const newPositionY = position_y !== undefined ? position_y : currentNote.position_y;
                const newWidth = width !== undefined ? width : currentNote.width;
                const newHeight = height !== undefined ? height : currentNote.height;
                const newZIndex = z_index !== undefined ? z_index : currentNote.z_index;

                const updateResult = await client.query(
                    `UPDATE notes
             SET title = $1, content = $2, category = $3, color_value = $4, position_x = $5, position_y = $6, width = $7, height = $8, z_index = $9
             WHERE id = $10 AND user_id = $11 RETURNING *`,
                    [newTitle, newContent, newCategory, newColorValue, newPositionX, newPositionY, newWidth, newHeight, newZIndex, noteId, req.user.id]
                );

                return { status: 200, updatedNote: updateResult.rows[0] };
            });

            if (data.payload) {
                return res.status(data.status).json(data.payload);
            }

            const updatedNote = data.updatedNote;

            // Broadcast update to shared note viewers if note is public
            if (updatedNote.is_public && updatedNote.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(updatedNote.share_token, 'noteUpdated', {
                    id: updatedNote.id,
                    title: updatedNote.title,
                    content: updatedNote.content,
                    category: updatedNote.category,
                    color_value: updatedNote.color_value,
                    updated_at: updatedNote.updated_at
                });
            }

            res.json(updatedNote);
        } catch (error) {
            console.error('Error updating note:', error);
            return sendError(res, 'Internal server error while updating note');
        }
    });

    // Delete a note
    router.delete('/notes/:noteId', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const checkResult = await client.query(
                    'SELECT id, title, share_token, is_public FROM notes WHERE id = $1 AND user_id = $2',
                    [noteId, req.user.id]
                );

                if (checkResult.rows.length === 0) {
                    return { status: 404, payload: { error: 'Note not found or access denied' } };
                }

                const noteInfo = checkResult.rows[0];
                console.log(`🗑️ Deleting note ${noteId} (${noteInfo.title}). Was shared: ${noteInfo.is_public}, Token: ${noteInfo.share_token}`);

                const result = await client.query(
                    'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
                    [noteId, req.user.id]
                );

                if (result.rows.length === 0) {
                    console.error(`❌ Failed to delete note ${noteId} - no rows affected`);
                    return { status: 404, payload: { error: 'Note not found or access denied' } };
                }

                return { status: 200, noteInfo };
            });

            if (data.payload) {
                return res.status(data.status).json(data.payload);
            }

            // Broadcast deletion to shared note viewers if note was public
            if (data.noteInfo.is_public && data.noteInfo.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(data.noteInfo.share_token, 'noteDeleted', {
                    id: noteId,
                    message: 'This note has been deleted by the owner'
                });
            }

            console.log(`✅ Note ${noteId} deleted successfully.`);
            res.status(200).json({ message: 'Note deleted successfully' });
        } catch (error) {
            console.error('Error deleting note:', error);
            return sendError(res, 'Internal server error while deleting note');
        }
    });

    // Update note content only
    router.put('/notes/:noteId/content', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const { content } = req.body;

            if (content === undefined) {
                return res.status(400).json({ error: 'Content is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE notes SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [content, noteId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Note not found' });
            }

            const updatedNote = result.rows[0];

            if (updatedNote.is_public && updatedNote.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(updatedNote.share_token, 'CONTENT_CHANGED', {
                    id: updatedNote.id,
                    content: updatedNote.content,
                    updated_at: updatedNote.updated_at
                });
            }

            res.json(updatedNote);
        } catch (error) {
            console.error('Error updating note content:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Update note title only
    router.put('/notes/:noteId/title', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const { title } = req.body;

            if (!title || title.trim() === '') {
                return res.status(400).json({ error: 'Title is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE notes SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [title.trim(), noteId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Note not found' });
            }

            const updatedNote = result.rows[0];

            if (updatedNote.is_public && updatedNote.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(updatedNote.share_token, 'TITLE_CHANGED', {
                    id: updatedNote.id,
                    title: updatedNote.title,
                    updated_at: updatedNote.updated_at
                });
            }

            res.json(updatedNote);
        } catch (error) {
            console.error('Error updating note title:', error);
            return sendError(res, 'Internal server error');
        }
    });

    // Update note category only
    router.put('/notes/:noteId/category', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const { category } = req.body;

            if (!category || category.trim() === '') {
                return res.status(400).json({ error: 'Category is required' });
            }

            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE notes SET category = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [category.trim(), noteId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Note not found' });
            }

            const updatedNote = result.rows[0];

            if (updatedNote.is_public && updatedNote.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(updatedNote.share_token, 'CATEGORY_CHANGED', {
                    id: updatedNote.id,
                    category: updatedNote.category,
                    updated_at: updatedNote.updated_at
                });
            }

            res.json(updatedNote);
        } catch (error) {
            console.error('Error updating note category:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
