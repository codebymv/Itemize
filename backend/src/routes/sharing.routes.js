/**
 * Sharing Routes - Extracted from index.js
 * Handles public shared-content capability reads.
 */
const express = require('express');
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
    if (Array.isArray(content)) {
        return content.map(sanitizeContent);
    }
    if (typeof content === 'object' && content !== null) {
        const sanitized = Object.create(null);
        for (const [key, value] of Object.entries(content)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            sanitized[key] = sanitizeContent(value);
        }
        return sanitized;
    }
    return content;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isShareToken = (token) => UUID_PATTERN.test(token);

const setCapabilityResponseHeaders = (res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex, nofollow');
};

/**
 * Create public sharing routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} publicRateLimit - Rate limiting middleware for public endpoints
 */
module.exports = (pool, _authenticateJWT, publicRateLimit, _broadcast = {}) => {

    // Get shared list (public)
    router.get('/shared/list/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            setCapabilityResponseHeaders(res);
            if (!isShareToken(token)) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }
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
            setCapabilityResponseHeaders(res);
            if (!isShareToken(token)) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }
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
            setCapabilityResponseHeaders(res);
            if (!isShareToken(token)) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }
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

    // Get shared wireframe (public capability read)
    router.get('/shared/wireframe/:token', publicRateLimit, async (req, res) => {
        try {
            const { token } = req.params;
            setCapabilityResponseHeaders(res);
            if (!isShareToken(token)) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }
            const result = await withDbClient(pool, async (client) => client.query(`
        SELECT w.id, w.title, w.category, w.flow_data, w.width, w.height,
               w.color_value, w.created_at, w.updated_at,
               u.name AS creator_name
        FROM wireframes w
        JOIN users u ON w.user_id = u.id
        WHERE w.share_token = $1 AND w.is_public = TRUE
      `, [token]));

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Shared content not found or no longer available' });
            }

            const wireframe = result.rows[0];
            res.json({
                id: wireframe.id,
                title: sanitizeContent(wireframe.title),
                category: sanitizeContent(wireframe.category),
                flow_data: sanitizeContent(wireframe.flow_data),
                width: wireframe.width,
                height: wireframe.height,
                color_value: wireframe.color_value,
                created_at: wireframe.created_at,
                updated_at: wireframe.updated_at,
                creator_name: sanitizeContent(wireframe.creator_name),
                type: 'wireframe'
            });
        } catch (error) {
            console.error('Error fetching shared wireframe:', error);
            return sendError(res, 'Internal server error while fetching shared content');
        }
    });

    return router;
};
