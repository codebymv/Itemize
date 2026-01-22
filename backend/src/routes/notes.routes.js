/**
 * Notes Routes - Extracted from index.js
 * Handles all note CRUD operations
 */
const express = require('express');
const router = express.Router();

/**
 * Create notes routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware  
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, broadcast) => {

    // Get all notes for the current user
    router.get('/notes', authenticateJWT, async (req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT id, user_id, title, content, category, color_value, position_x, position_y, width, height, z_index, created_at, updated_at, share_token, is_public, shared_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC',
                [req.user.id]
            );
            client.release();
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching notes:', error);
            res.status(500).json({ error: 'Internal server error while fetching notes' });
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

            const client = await pool.connect();
            const result = await client.query(
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
            );
            client.release();
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating note:', error);
            res.status(500).json({ error: 'Internal server error while creating note' });
        }
    });

    // Update an existing note
    router.put('/notes/:noteId', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const { title, content, category, color_value, position_x, position_y, width, height, z_index } = req.body;

            const client = await pool.connect();
            const currentNoteResult = await client.query('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [noteId, req.user.id]);

            if (currentNoteResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Note not found or access denied' });
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
            client.release();

            const updatedNote = updateResult.rows[0];

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
            res.status(500).json({ error: 'Internal server error while updating note' });
        }
    });

    // Delete a note
    router.delete('/notes/:noteId', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const client = await pool.connect();

            const checkResult = await client.query(
                'SELECT id, title, share_token, is_public FROM notes WHERE id = $1 AND user_id = $2',
                [noteId, req.user.id]
            );

            if (checkResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Note not found or access denied' });
            }

            const noteInfo = checkResult.rows[0];
            console.log(`🗑️ Deleting note ${noteId} (${noteInfo.title}). Was shared: ${noteInfo.is_public}, Token: ${noteInfo.share_token}`);

            const result = await client.query(
                'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
                [noteId, req.user.id]
            );
            client.release();

            if (result.rows.length === 0) {
                console.error(`❌ Failed to delete note ${noteId} - no rows affected`);
                return res.status(404).json({ error: 'Note not found or access denied' });
            }

            // Broadcast deletion to shared note viewers if note was public
            if (noteInfo.is_public && noteInfo.share_token && broadcast.noteUpdate) {
                broadcast.noteUpdate(noteInfo.share_token, 'noteDeleted', {
                    id: noteId,
                    message: 'This note has been deleted by the owner'
                });
            }

            console.log(`✅ Note ${noteId} deleted successfully.`);
            res.status(200).json({ message: 'Note deleted successfully' });
        } catch (error) {
            console.error('Error deleting note:', error);
            res.status(500).json({ error: 'Internal server error while deleting note' });
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

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE notes SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [content, noteId, req.user.id]
            );
            client.release();

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
            res.status(500).json({ error: 'Internal server error' });
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

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE notes SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [title.trim(), noteId, req.user.id]
            );
            client.release();

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
            res.status(500).json({ error: 'Internal server error' });
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

            const client = await pool.connect();
            const result = await client.query(
                'UPDATE notes SET category = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
                [category.trim(), noteId, req.user.id]
            );
            client.release();

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
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
