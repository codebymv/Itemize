/**
 * Conversations Routes
 * Unified inbox for contact communications
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');

module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    // ======================
    // Conversations
    // ======================

    /**
     * GET /api/conversations - List conversations
     */
    router.get('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, assigned_to, contact_id, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE c.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND c.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (assigned_to) {
                whereClause += ` AND c.assigned_to = $${paramIndex}`;
                params.push(parseInt(assigned_to));
                paramIndex++;
            }

            if (contact_id) {
                whereClause += ` AND c.contact_id = $${paramIndex}`;
                params.push(parseInt(contact_id));
                paramIndex++;
            }

            const client = await pool.connect();

            const countResult = await client.query(
                `SELECT COUNT(*) FROM conversations c ${whereClause}`,
                params
            );

            const result = await client.query(`
        SELECT c.*,
               ct.first_name as contact_first_name,
               ct.last_name as contact_last_name,
               ct.email as contact_email,
               u.name as assigned_to_name
        FROM conversations c
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        LEFT JOIN users u ON c.assigned_to = u.id
        ${whereClause}
        ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]);

            client.release();

            res.json({
                conversations: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching conversations:', error);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        }
    });

    /**
     * GET /api/conversations/:id - Get conversation with messages
     */
    router.get('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            const convResult = await client.query(`
        SELECT c.*,
               ct.first_name as contact_first_name,
               ct.last_name as contact_last_name,
               ct.email as contact_email,
               ct.phone as contact_phone,
               u.name as assigned_to_name
        FROM conversations c
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.id = $1 AND c.organization_id = $2
      `, [id, req.organizationId]);

            if (convResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Conversation not found' });
            }

            const messagesResult = await client.query(`
        SELECT m.*,
               u.name as sender_user_name,
               ct.first_name as sender_contact_first_name,
               ct.last_name as sender_contact_last_name
        FROM messages m
        LEFT JOIN users u ON m.sender_user_id = u.id
        LEFT JOIN contacts ct ON m.sender_contact_id = ct.id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at ASC
      `, [id]);

            client.release();

            const conversation = convResult.rows[0];
            conversation.messages = messagesResult.rows;

            res.json(conversation);
        } catch (error) {
            console.error('Error fetching conversation:', error);
            res.status(500).json({ error: 'Failed to fetch conversation' });
        }
    });

    /**
     * POST /api/conversations - Create conversation
     */
    router.post('/', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { contact_id, subject, channel, initial_message } = req.body;

            if (!contact_id) {
                return res.status(400).json({ error: 'contact_id is required' });
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Check for existing open conversation with contact
                const existingResult = await client.query(`
          SELECT id FROM conversations
          WHERE organization_id = $1 AND contact_id = $2 AND status = 'open'
          LIMIT 1
        `, [req.organizationId, contact_id]);

                let conversationId;

                if (existingResult.rows.length > 0) {
                    conversationId = existingResult.rows[0].id;
                } else {
                    const convResult = await client.query(`
            INSERT INTO conversations (organization_id, contact_id, assigned_to, channel, subject)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `, [
                        req.organizationId,
                        contact_id,
                        req.user.id,
                        channel || 'internal',
                        subject || null
                    ]);
                    conversationId = convResult.rows[0].id;
                }

                // Add initial message if provided
                if (initial_message) {
                    await client.query(`
            INSERT INTO messages (conversation_id, organization_id, sender_type, sender_user_id, channel, content)
            VALUES ($1, $2, 'user', $3, $4, $5)
          `, [conversationId, req.organizationId, req.user.id, channel || 'internal', initial_message]);

                    await client.query(`
            UPDATE conversations SET
              last_message_at = CURRENT_TIMESTAMP,
              last_message_preview = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [initial_message.substring(0, 200), conversationId]);
                }

                await client.query('COMMIT');

                // Fetch full conversation
                const result = await client.query(`
          SELECT c.*,
                 ct.first_name as contact_first_name,
                 ct.last_name as contact_last_name,
                 ct.email as contact_email
          FROM conversations c
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.id = $1
        `, [conversationId]);

                client.release();
                res.status(201).json(result.rows[0]);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            res.status(500).json({ error: 'Failed to create conversation' });
        }
    });

    /**
     * PATCH /api/conversations/:id - Update conversation status
     */
    router.patch('/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, snoozed_until } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
        UPDATE conversations SET
          status = COALESCE($1, status),
          snoozed_until = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND organization_id = $4
        RETURNING *
      `, [status, snoozed_until || null, id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating conversation:', error);
            res.status(500).json({ error: 'Failed to update conversation' });
        }
    });

    /**
     * POST /api/conversations/:id/assign - Assign conversation
     */
    router.post('/:id/assign', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { assigned_to } = req.body;

            const client = await pool.connect();

            const result = await client.query(`
        UPDATE conversations SET
          assigned_to = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND organization_id = $3
        RETURNING *
      `, [assigned_to || null, id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error assigning conversation:', error);
            res.status(500).json({ error: 'Failed to assign conversation' });
        }
    });

    // ======================
    // Messages
    // ======================

    /**
     * POST /api/conversations/:id/messages - Send message
     */
    router.post('/:id/messages', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { content, channel, content_html, metadata } = req.body;

            if (!content || content.trim().length === 0) {
                return res.status(400).json({ error: 'Message content is required' });
            }

            const client = await pool.connect();

            // Verify conversation
            const convCheck = await client.query(
                'SELECT id FROM conversations WHERE id = $1 AND organization_id = $2',
                [id, req.organizationId]
            );

            if (convCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Conversation not found' });
            }

            try {
                await client.query('BEGIN');

                const messageResult = await client.query(`
          INSERT INTO messages (conversation_id, organization_id, sender_type, sender_user_id, channel, content, content_html, metadata)
          VALUES ($1, $2, 'user', $3, $4, $5, $6, $7)
          RETURNING *
        `, [
                    id,
                    req.organizationId,
                    req.user.id,
                    channel || 'internal',
                    content.trim(),
                    content_html || null,
                    JSON.stringify(metadata || {})
                ]);

                // Update conversation
                await client.query(`
          UPDATE conversations SET
            last_message_at = CURRENT_TIMESTAMP,
            last_message_preview = $1,
            status = CASE WHEN status = 'snoozed' THEN 'open' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [content.substring(0, 200), id]);

                await client.query('COMMIT');

                // Fetch message with sender info
                const fullMessage = await client.query(`
          SELECT m.*, u.name as sender_user_name
          FROM messages m
          LEFT JOIN users u ON m.sender_user_id = u.id
          WHERE m.id = $1
        `, [messageResult.rows[0].id]);

                client.release();
                res.status(201).json(fullMessage.rows[0]);
            } catch (error) {
                await client.query('ROLLBACK');
                client.release();
                throw error;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    /**
     * PATCH /api/conversations/:id/read - Mark conversation as read
     */
    router.patch('/:id/read', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const client = await pool.connect();

            // Mark all messages as read
            await client.query(`
        UPDATE messages SET is_read = TRUE
        WHERE conversation_id = $1 AND is_read = FALSE
      `, [id]);

            // Reset unread count
            const result = await client.query(`
        UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND organization_id = $2
        RETURNING *
      `, [id, req.organizationId]);

            client.release();

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error marking read:', error);
            res.status(500).json({ error: 'Failed to mark as read' });
        }
    });

    return router;
};
