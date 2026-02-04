/**
 * Admin Email Routes - Communications functionality for admins
 * Send emails, preview templates, view logs
 */

const express = require('express');
const { logger } = require('../utils/logger');
const emailService = require('../services/emailService');
const { wrapInBrandedTemplate } = require('../services/email-template.service');

module.exports = (pool, authenticateJWT, requireAdmin) => {
    const router = express.Router();

    // Apply authentication and admin check to all routes
    router.use(authenticateJWT);
    router.use(requireAdmin);

    // ============================================
    // Email Sending Routes
    // ============================================

    /**
     * POST /api/admin/email/send
     * Send emails to recipients
     */
    router.post('/send', async (req, res) => {
        try {
            const { recipients, subject, bodyHtml } = req.body;
            const userId = req.user?.id;

            // Validation
            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'recipients array is required',
                        code: 'VALIDATION_ERROR'
                    }
                });
            }

            if (!subject || !bodyHtml) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'subject and bodyHtml are required',
                        code: 'VALIDATION_ERROR'
                    }
                });
            }

            const results = {
                sent: 0,
                failed: 0,
                errors: []
            };

            // Send emails to each recipient
            for (const recipient of recipients) {
                try {
                    const recipientEmail = recipient.email;
                    const recipientName = recipient.name || '';

                    if (!recipientEmail) {
                        results.failed++;
                        results.errors.push(`Missing email for recipient`);
                        continue;
                    }

                    // Replace variables in email
                    const variables = {
                        userName: recipientName || recipientEmail.split('@')[0],
                        userEmail: recipientEmail,
                        dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
                        unsubscribeUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe`,
                    };

                    let personalizedHtml = bodyHtml;
                    let personalizedSubject = subject;

                    // Replace {{variable}} placeholders
                    Object.entries(variables).forEach(([key, value]) => {
                        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                        personalizedHtml = personalizedHtml.replace(regex, value);
                        personalizedSubject = personalizedSubject.replace(regex, value);
                    });

                    // Wrap in branded template (not a preview - actual email)
                    const wrappedHtml = wrapInBrandedTemplate(personalizedHtml, { 
                        subject: personalizedSubject,
                        isPreview: false 
                    });

                    // Send email
                    const sendResult = await emailService.sendEmail({
                        to: recipientEmail,
                        subject: personalizedSubject,
                        html: wrappedHtml,
                    });

                    // Log the email - use both to_email (existing) and recipient_email (new)
                    try {
                        await pool.query(
                            `INSERT INTO email_logs 
                                (to_email, recipient_email, recipient_id, recipient_name, subject, body_html, status, external_id, sent_by, sent_at, queued_at, created_at)
                             VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())`,
                            [
                                recipientEmail,
                                recipient.id || null,
                                recipientName || null,
                                personalizedSubject,
                                wrappedHtml,
                                sendResult.success ? 'sent' : 'failed',
                                sendResult.id || null,
                                userId
                            ]
                        );
                    } catch (logError) {
                        logger.warn('Failed to log email', { error: logError.message });
                    }

                    if (sendResult.success || sendResult.simulated) {
                        results.sent++;
                    } else {
                        results.failed++;
                        results.errors.push(`Failed to send to ${recipientEmail}: ${sendResult.error}`);
                    }

                    // Small delay between sends to avoid rate limiting
                    if (recipients.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (recipientError) {
                    results.failed++;
                    results.errors.push(`Error processing recipient: ${recipientError.message}`);
                }
            }

            logger.info('Admin email batch sent', {
                userId,
                totalRecipients: recipients.length,
                sent: results.sent,
                failed: results.failed
            });

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            logger.error('Error sending admin emails:', error);
            res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to send emails',
                    code: 'INTERNAL_ERROR'
                }
            });
        }
    });

    /**
     * POST /api/admin/email/preview
     * Generate preview HTML for an email
     */
    router.post('/preview', async (req, res) => {
        try {
            const { subject, bodyHtml, baseUrl } = req.body;

            if (!bodyHtml) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'bodyHtml is required',
                        code: 'VALIDATION_ERROR'
                    }
                });
            }

            // Replace sample variables for preview
            const sampleVariables = {
                userName: 'John Doe',
                userEmail: 'john@example.com',
                dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
                unsubscribeUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe`,
            };

            let previewHtml = bodyHtml;
            let previewSubject = subject || 'Preview';

            Object.entries(sampleVariables).forEach(([key, value]) => {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                previewHtml = previewHtml.replace(regex, value);
                previewSubject = previewSubject.replace(regex, value);
            });

            // Wrap in branded template (this is a preview)
            const wrappedHtml = wrapInBrandedTemplate(previewHtml, { 
                subject: previewSubject,
                isPreview: true,
                baseUrl
            });

            res.json({
                success: true,
                data: {
                    html: wrappedHtml,
                    subject: previewSubject
                }
            });
        } catch (error) {
            logger.error('Error generating email preview:', error);
            res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to generate preview',
                    code: 'INTERNAL_ERROR'
                }
            });
        }
    });

    // ============================================
    // Email Logs Routes
    // ============================================

    /**
     * GET /api/admin/email/logs
     * Get email logs with pagination
     */
    router.get('/logs', async (req, res) => {
        try {
            const { page = '0', limit = '50', status } = req.query;
            const pageNum = parseInt(page, 10);
            const limitNum = Math.min(parseInt(limit, 10), 100);
            const offset = pageNum * limitNum;

            let whereClause = '';
            const params = [];
            let paramIndex = 1;

            if (status) {
                whereClause = `WHERE status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            // Get logs
            const logsQuery = `
                SELECT 
                    el.*,
                    u.name as sent_by_name,
                    u.email as sent_by_email
                FROM email_logs el
                LEFT JOIN users u ON el.sent_by = u.id
                ${whereClause}
                ORDER BY el.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(limitNum + 1, offset);

            const logsResult = await pool.query(logsQuery, params);
            const hasMore = logsResult.rows.length > limitNum;
            const logs = hasMore ? logsResult.rows.slice(0, limitNum) : logsResult.rows;

            // Get total count
            const countParams = status ? [status] : [];
            const countQuery = `SELECT COUNT(*) FROM email_logs ${whereClause}`;
            const countResult = await pool.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].count, 10);

            res.json({
                success: true,
                data: {
                    logs: logs.map(log => ({
                        id: log.id,
                        recipientEmail: log.recipient_email || log.to_email,
                        recipientId: log.recipient_id,
                        recipientName: log.recipient_name,
                        subject: log.subject,
                        status: log.status,
                        externalId: log.external_id,
                        errorMessage: log.error_message,
                        sentBy: log.sent_by,
                        sentByName: log.sent_by_name,
                        sentByEmail: log.sent_by_email,
                        sentAt: log.sent_at,
                        createdAt: log.created_at || log.queued_at
                    })),
                    total,
                    hasMore
                }
            });
        } catch (error) {
            logger.error('Error fetching email logs:', error);
            res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to fetch email logs',
                    code: 'INTERNAL_ERROR'
                }
            });
        }
    });

    /**
     * GET /api/admin/email/logs/:id
     * Get a single email log with full content
     */
    router.get('/logs/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query(
                `SELECT 
                    el.*,
                    u.name as sent_by_name,
                    u.email as sent_by_email
                FROM email_logs el
                LEFT JOIN users u ON el.sent_by = u.id
                WHERE el.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: {
                        message: 'Email log not found',
                        code: 'NOT_FOUND'
                    }
                });
            }

            const log = result.rows[0];

            res.json({
                success: true,
                data: {
                    id: log.id,
                    recipientEmail: log.recipient_email || log.to_email,
                    recipientId: log.recipient_id,
                    recipientName: log.recipient_name,
                    subject: log.subject,
                    bodyHtml: log.body_html,
                    status: log.status,
                    externalId: log.external_id,
                    errorMessage: log.error_message,
                    sentBy: log.sent_by,
                    sentByName: log.sent_by_name,
                    sentByEmail: log.sent_by_email,
                    sentAt: log.sent_at,
                    createdAt: log.created_at || log.queued_at
                }
            });
        } catch (error) {
            logger.error('Error fetching email log:', error);
            res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to fetch email log',
                    code: 'INTERNAL_ERROR'
                }
            });
        }
    });

    // ============================================
    // Email Templates (Admin access to all org templates)
    // ============================================

    /**
     * GET /api/admin/email/templates
     * Get all email templates across all organizations (admin view)
     */
    router.get('/templates', async (req, res) => {
        try {
            const { category, search } = req.query;

            let query = `
                SELECT 
                    et.*,
                    u.name as created_by_name,
                    o.name as organization_name
                FROM email_templates et
                LEFT JOIN users u ON et.created_by = u.id
                LEFT JOIN organizations o ON et.organization_id = o.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;

            if (category) {
                query += ` AND et.category = $${paramIndex}`;
                params.push(category);
                paramIndex++;
            }

            if (search) {
                query += ` AND (et.name ILIKE $${paramIndex} OR et.subject ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            query += ' ORDER BY et.updated_at DESC LIMIT 100';

            const result = await pool.query(query, params);

            res.json({
                success: true,
                data: {
                    templates: result.rows.map(t => ({
                        id: t.id,
                        name: t.name,
                        subject: t.subject,
                        bodyHtml: t.body_html,
                        category: t.category,
                        isActive: t.is_active,
                        organizationId: t.organization_id,
                        organizationName: t.organization_name,
                        createdBy: t.created_by,
                        createdByName: t.created_by_name,
                        createdAt: t.created_at,
                        updatedAt: t.updated_at
                    })),
                    total: result.rows.length
                }
            });
        } catch (error) {
            logger.error('Error fetching admin email templates:', error);
            res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to fetch templates',
                    code: 'INTERNAL_ERROR'
                }
            });
        }
    });

    return router;
};
