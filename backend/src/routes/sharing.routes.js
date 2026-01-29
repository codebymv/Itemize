/**
 * Sharing Routes - Extracted from index.js
 * Handles share/unshare operations and public shared content endpoints
 */
const express = require('express');
const crypto = require('crypto');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const router = express.Router();
const { withDbClient } = require('../utils/db');
const { sendError } = require('../utils/response');

// Set up DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Helper function to sanitize content for public sharing
const sanitizeContent = (content) => {
    if (typeof content === 'string') {
        return purify.sanitize(content);
    }
    if (typeof content === 'object' && content !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(content)) {
            if (typeof value === 'string') {
                sanitized[key] = purify.sanitize(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    return content;
};

/**
 * Create sharing routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Function} publicRateLimit - Rate limiting middleware for public endpoints
 */
module.exports = (pool, authenticateJWT, publicRateLimit) => {

    // --- Share/Unshare Operations (Authenticated) ---

    // Share a list
    router.post('/lists/:listId/share', authenticateJWT, async (req, res) => {
        try {
            const { listId } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const listResult = await client.query(
                    'SELECT id, share_token, is_public FROM lists WHERE id = $1 AND user_id = $2',
                    [listId, req.user.id]
                );

                if (listResult.rows.length === 0) {
                    return { status: 404, error: 'List not found or access denied' };
                }

                const list = listResult.rows[0];
                let shareToken = list.share_token;

                if (!shareToken) {
                    shareToken = crypto.randomUUID();
                    await client.query(
                        'UPDATE lists SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [shareToken, listId]
                    );
                } else if (!list.is_public) {
                    await client.query(
                        'UPDATE lists SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
                        [listId]
                    );
                }

                return { status: 200, shareToken };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            const frontendHost = process.env.NODE_ENV === 'production'
                ? 'itemize.cloud'
                : 'localhost:5173';

            res.json({
                shareToken: data.shareToken,
                shareUrl: `${req.protocol}://${frontendHost}/shared/list/${data.shareToken}`
            });
        } catch (error) {
            console.error('Error sharing list:', error);
            return sendError(res, 'Internal server error while sharing list');
        }
    });

    // Unshare a list
    router.delete('/lists/:listId/share', authenticateJWT, async (req, res) => {
        try {
            const { listId } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE lists SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
                [listId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'List not found or access denied' });
            }

            res.json({ message: 'List sharing revoked successfully' });
        } catch (error) {
            console.error('Error unsharing list:', error);
            return sendError(res, 'Internal server error while unsharing list');
        }
    });

    // Share a note
    router.post('/notes/:noteId/share', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const noteResult = await client.query(
                    'SELECT id, share_token, is_public FROM notes WHERE id = $1 AND user_id = $2',
                    [noteId, req.user.id]
                );

                if (noteResult.rows.length === 0) {
                    return { status: 404, error: 'Note not found or access denied' };
                }

                const note = noteResult.rows[0];
                let shareToken = note.share_token;

                if (!shareToken) {
                    shareToken = crypto.randomUUID();
                    await client.query(
                        'UPDATE notes SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [shareToken, noteId]
                    );
                } else if (!note.is_public) {
                    await client.query(
                        'UPDATE notes SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
                        [noteId]
                    );
                }

                return { status: 200, shareToken };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            const frontendHost = process.env.NODE_ENV === 'production'
                ? 'itemize.cloud'
                : 'localhost:5173';

            res.json({
                shareToken: data.shareToken,
                shareUrl: `${req.protocol}://${frontendHost}/shared/note/${data.shareToken}`
            });
        } catch (error) {
            console.error('Error sharing note:', error);
            return sendError(res, 'Internal server error while sharing note');
        }
    });

    // Unshare a note
    router.delete('/notes/:noteId/share', authenticateJWT, async (req, res) => {
        try {
            const { noteId } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE notes SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
                [noteId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Note not found or access denied' });
            }

            res.json({ message: 'Note sharing revoked successfully' });
        } catch (error) {
            console.error('Error unsharing note:', error);
            return sendError(res, 'Internal server error while unsharing note');
        }
    });

    // Share a whiteboard
    router.post('/whiteboards/:whiteboardId/share', authenticateJWT, async (req, res) => {
        try {
            const { whiteboardId } = req.params;
            const data = await withDbClient(pool, async (client) => {
                const whiteboardResult = await client.query(
                    'SELECT id, share_token, is_public FROM whiteboards WHERE id = $1 AND user_id = $2',
                    [whiteboardId, req.user.id]
                );

                if (whiteboardResult.rows.length === 0) {
                    return { status: 404, error: 'Whiteboard not found or access denied' };
                }

                const whiteboard = whiteboardResult.rows[0];
                let shareToken = whiteboard.share_token;

                if (!shareToken) {
                    shareToken = crypto.randomUUID();
                    await client.query(
                        'UPDATE whiteboards SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [shareToken, whiteboardId]
                    );
                } else if (!whiteboard.is_public) {
                    await client.query(
                        'UPDATE whiteboards SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
                        [whiteboardId]
                    );
                }

                return { status: 200, shareToken };
            });

            if (data.error) {
                return res.status(data.status).json({ error: data.error });
            }

            const frontendHost = process.env.NODE_ENV === 'production'
                ? 'itemize.cloud'
                : 'localhost:5173';

            res.json({
                shareToken: data.shareToken,
                shareUrl: `${req.protocol}://${frontendHost}/shared/whiteboard/${data.shareToken}`
            });
        } catch (error) {
            console.error('Error sharing whiteboard:', error);
            return sendError(res, 'Internal server error while sharing whiteboard');
        }
    });

    // Unshare a whiteboard
    router.delete('/whiteboards/:whiteboardId/share', authenticateJWT, async (req, res) => {
        try {
            const { whiteboardId } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(
                'UPDATE whiteboards SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
                [whiteboardId, req.user.id]
            ));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Whiteboard not found or access denied' });
            }

            res.json({ message: 'Whiteboard sharing revoked successfully' });
        } catch (error) {
            console.error('Error unsharing whiteboard:', error);
            return sendError(res, 'Internal server error while unsharing whiteboard');
        }
    });

    // --- Public Shared Content Endpoints ---

    // Get shared list (public)
    router.get('/shared/list/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
        SELECT l.id, l.title, l.category, l.items, l.color_value, l.created_at, l.updated_at,
               u.name as creator_name
        FROM lists l
        JOIN users u ON l.user_id = u.id
        WHERE l.share_token = $1 AND l.is_public = TRUE
      `, [token]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }

            const list = result.rows[0];

            const sanitizedList = {
                id: list.id,
                title: sanitizeContent(list.title),
                category: sanitizeContent(list.category),
                items: list.items ? list.items.map(item => ({
                    id: item.id,
                    text: sanitizeContent(item.text),
                    completed: item.completed
                })) : [],
                color_value: list.color_value,
                created_at: list.created_at,
                updated_at: list.updated_at,
                creator_name: sanitizeContent(list.creator_name),
                type: 'list'
            };

            res.json(sanitizedList);
        } catch (error) {
            console.error('Error fetching shared list:', error);
            return sendError(res, 'Internal server error while fetching shared content');
        }
    });

    // Get shared note (public)
    router.get('/shared/note/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
        SELECT n.id, n.title, n.content, n.category, n.color_value, n.created_at, n.updated_at,
               u.name as creator_name
        FROM notes n
        JOIN users u ON n.user_id = u.id
        WHERE n.share_token = $1 AND n.is_public = TRUE
      `, [token]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }

            const note = result.rows[0];

            const sanitizedNote = {
                id: note.id,
                title: sanitizeContent(note.title),
                content: sanitizeContent(note.content),
                category: sanitizeContent(note.category),
                color_value: note.color_value,
                created_at: note.created_at,
                updated_at: note.updated_at,
                creator_name: sanitizeContent(note.creator_name),
                type: 'note'
            };

            res.json(sanitizedNote);
        } catch (error) {
            console.error('Error fetching shared note:', error);
            return sendError(res, 'Internal server error while fetching shared content');
        }
    });

    // Get shared whiteboard (public)
    router.get('/shared/whiteboard/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            const result = await withDbClient(pool, async (client) => client.query(`
        SELECT w.id, w.title, w.category, w.canvas_data, w.canvas_width, w.canvas_height,
               w.background_color, w.color_value, w.created_at, w.updated_at,
               u.name as creator_name
        FROM whiteboards w
        JOIN users u ON w.user_id = u.id
        WHERE w.share_token = $1 AND w.is_public = TRUE
      `, [token]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }

            const whiteboard = result.rows[0];

            const sanitizedWhiteboard = {
                id: whiteboard.id,
                title: sanitizeContent(whiteboard.title),
                category: sanitizeContent(whiteboard.category),
                canvas_data: sanitizeContent(whiteboard.canvas_data),
                canvas_width: whiteboard.canvas_width,
                canvas_height: whiteboard.canvas_height,
                background_color: whiteboard.background_color,
                color_value: whiteboard.color_value,
                created_at: whiteboard.created_at,
                updated_at: whiteboard.updated_at,
                creator_name: sanitizeContent(whiteboard.creator_name),
                type: 'whiteboard'
            };

            res.json(sanitizedWhiteboard);
        } catch (error) {
            console.error('Error fetching shared whiteboard:', error);
            if (error.message && error.message.includes('timeout')) {
                return sendError(res, 'Database temporarily unavailable. Please try again in a moment.', 503);
            } else if (error.code === 'ECONNREFUSED') {
                return sendError(res, 'Database connection failed. Please try again later.', 503);
            } else {
                return sendError(res, 'Internal server error while fetching shared content');
            }
        }
    });

    return router;
};
