const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendNotFound, sendError } = require('../../utils/response');
const crypto = require('crypto');
const emailService = require('../../services/emailService');
const smsService = require('../../services/smsService');
const { REVIEW_REQUEST_COLUMNS } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Review Requests
    // ======================

    /**
     * GET /api/reputation/requests - List review requests
     */
    router.get('/requests', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { status, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE rr.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND rr.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            const { countResult, result } = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM review_requests rr ${whereClause}`,
                    params
                );

                const result = await client.query(`
                    SELECT ${REVIEW_REQUEST_COLUMNS.split(', ').map(column => `rr.${column}`).join(', ')},
                           c.first_name, c.last_name, c.email
                    FROM review_requests rr
                    LEFT JOIN contacts c
                      ON rr.contact_id = c.id AND c.organization_id = rr.organization_id
                    ${whereClause}
                    ORDER BY rr.created_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return { countResult, result };
            });

            res.json({
                requests: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching review requests:', error);
            return sendError(res, 'Failed to fetch review requests');
        }
    });

    /**
     * DELETE /api/reputation/requests/:id - Delete a review request
     */
    router.delete('/requests/:id', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, client => client.query(
                `DELETE FROM review_requests
                 WHERE id = $1 AND organization_id = $2
                 RETURNING id`,
                [req.params.id, req.organizationId]
            ));
            if (result.rows.length === 0) return sendNotFound(res, 'Review request');
            return sendSuccess(res, { id: result.rows[0].id, deleted: true });
        } catch (error) {
            if (error && error.constraint === 'review_request_active_delivery') {
                return res.status(409).json({ error: 'Review request has an unresolved delivery' });
            }
            console.error('Error deleting review request:', error);
            return sendError(res, 'Failed to delete review request');
        }
    });

    /**
     * POST /api/reputation/requests - Send review request
     */
    router.post('/requests', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const {
                contact_id,
                contact_email,
                contact_phone,
                contact_name,
                channel,
                custom_message,
                preferred_platform,
                redirect_url,
                scheduled_at
            } = req.body;

            if (!contact_id && !contact_email && !contact_phone) {
                return res.status(400).json({ error: 'Contact information required' });
            }

            if (!channel) {
                return res.status(400).json({ error: 'Channel (email/sms/both) required' });
            }

            const request = await withDbClient(pool, async (client) => {
                // Get contact info if contact_id provided
                let contactInfo = {
                    email: contact_email,
                    phone: contact_phone,
                    name: contact_name
                };

                if (contact_id) {
                    const contactResult = await client.query(
                        'SELECT email, phone, first_name, last_name FROM contacts WHERE id = $1 AND organization_id = $2',
                        [contact_id, req.organizationId]
                    );

                    if (contactResult.rows.length > 0) {
                        const c = contactResult.rows[0];
                        contactInfo.email = contactInfo.email || c.email;
                        contactInfo.phone = contactInfo.phone || c.phone;
                        contactInfo.name = contactInfo.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
                    }
                }

                // Generate unique token
                const uniqueToken = crypto.randomBytes(32).toString('hex');

                // Get default redirect URL from settings
                let reviewUrl = redirect_url;
                if (!reviewUrl) {
                    const settingsResult = await client.query(
                        'SELECT default_review_url FROM reputation_settings WHERE organization_id = $1',
                        [req.organizationId]
                    );
                    reviewUrl = settingsResult.rows[0]?.default_review_url;
                }

                const result = await client.query(`
                    INSERT INTO review_requests (
                        organization_id, contact_id, contact_email, contact_phone, contact_name,
                        channel, custom_message, preferred_platform, redirect_url,
                        scheduled_at, unique_token, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING ${REVIEW_REQUEST_COLUMNS}
                `, [
                    req.organizationId,
                    contact_id || null,
                    contactInfo.email,
                    contactInfo.phone,
                    contactInfo.name,
                    channel,
                    custom_message || null,
                    preferred_platform || null,
                    reviewUrl,
                    scheduled_at || null,
                    uniqueToken,
                    scheduled_at ? 'pending' : 'sent'
                ]);

                const request = result.rows[0];

                // If not scheduled, send immediately
                if (!scheduled_at) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                    const reviewLink = `${frontendUrl}/review/${uniqueToken}`;
                    const orgResult = await client.query('SELECT name FROM organizations WHERE id = $1', [req.organizationId]);
                    const organizationName = orgResult.rows[0]?.name || 'our business';

                    const messageContent = custom_message || `Hi ${contactInfo.name || 'there'},\n\nThank you for choosing ${organizationName}. We'd love to hear about your experience! Please take a moment to leave us a review:\n\n${reviewLink}\n\nThank you!`;

                    let emailSent = false;
                    let smsSent = false;

                    if (channel === 'email' || channel === 'both') {
                        if (contactInfo.email) {
                            const emailSubject = `We'd love your feedback on ${organizationName}`;
                            const emailHtml = `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2>How did we do?</h2>
                                    <p>${messageContent.replace(/\n/g, '<br>')}</p>
                                    <div style="margin-top: 20px;">
                                        <a href="${reviewLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Leave a Review</a>
                                    </div>
                                </div>
                            `;

                            await emailService.sendEmail({
                                to: contactInfo.email,
                                subject: emailSubject,
                                html: emailHtml,
                                text: messageContent
                            });
                            emailSent = true;
                        }
                    }

                    if (channel === 'sms' || channel === 'both') {
                        if (contactInfo.phone) {
                            await smsService.sendDirectSms({
                                to: contactInfo.phone,
                                message: messageContent
                            });
                            smsSent = true;
                        }
                    }

                    // Mark as sent
                    await client.query(`
                        UPDATE review_requests SET
                            email_sent = $1,
                            email_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                            sms_sent = $2,
                            sms_sent_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END
                        WHERE id = $3
                    `, [
                        emailSent,
                        smsSent,
                        request.id
                    ]);
                }

                return request;
            });
            res.status(201).json(request);
        } catch (error) {
            console.error('Error creating review request:', error);
            return sendError(res, 'Failed to create review request');
        }
    });

    /**
     * POST /api/reputation/requests/:id/resend - Resend review request
     */
    router.post('/requests/:id/resend', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;

            const request = await withDbClient(pool, async (client) => {
                // Get existing request
                const result = await client.query(
                    `SELECT ${REVIEW_REQUEST_COLUMNS} FROM review_requests WHERE id = $1 AND organization_id = $2`,
                    [id, req.organizationId]
                );

                if (result.rows.length === 0) {
                    return null;
                }

                // Update request
                const updatedResult = await client.query(`
                    UPDATE review_requests SET
                        status = 'sent',
                        email_sent = CASE WHEN channel IN ('email', 'both') THEN true ELSE email_sent END,
                        email_sent_at = CASE WHEN channel IN ('email', 'both') THEN CURRENT_TIMESTAMP ELSE email_sent_at END,
                        sms_sent = CASE WHEN channel IN ('sms', 'both') THEN true ELSE sms_sent END,
                        sms_sent_at = CASE WHEN channel IN ('sms', 'both') THEN CURRENT_TIMESTAMP ELSE sms_sent_at END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING ${REVIEW_REQUEST_COLUMNS}
                `, [id]);

                const requestData = updatedResult.rows[0];

                // Get organization details for email/sms
                const orgResult = await client.query('SELECT name FROM organizations WHERE id = $1', [req.organizationId]);
                const orgName = orgResult.rows[0]?.name || 'us';

                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                const reviewLink = `${frontendUrl}/r/${requestData.unique_token}`;

                // Get custom message or use default
                const messageBody = requestData.custom_message || `Hi ${requestData.contact_name || 'there'}, we'd love to hear about your experience with ${orgName}. Please leave us a review: ${reviewLink}`;

                // Send email if requested
                if (requestData.channel === 'email' || requestData.channel === 'both') {
                    if (requestData.contact_email && emailService.isEnabled()) {
                        await emailService.sendEmail({
                            to: requestData.contact_email,
                            subject: `How did we do? Leave a review for ${orgName}`,
                            text: messageBody,
                            html: `<p>${messageBody.replace(/\n/g, '<br>')}</p>`,
                        });
                    }
                }

                // Send SMS if requested
                if (requestData.channel === 'sms' || requestData.channel === 'both') {
                    if (requestData.contact_phone && smsService.isEnabled()) {
                        await smsService.sendSms({
                            to: requestData.contact_phone,
                            message: messageBody,
                        });
                    }
                }

                return requestData;
            });

            if (!request) {
                return res.status(404).json({ error: 'Review request not found' });
            }

            res.json(request);
        } catch (error) {
            console.error('Error resending review request:', error);
            return sendError(res, 'Failed to resend review request');
        }
    });

    /**
     * POST /api/reputation/requests/bulk - Send bulk review requests
     */
    router.post('/requests/bulk', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { contact_ids, channel, custom_message, preferred_platform } = req.body;

            if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
                return res.status(400).json({ error: 'Contact IDs array required' });
            }

            const requests = await withDbClient(pool, async (client) => {
                // Get contacts
                const contactsResult = await client.query(`
                    SELECT id, email, phone, first_name, last_name
                    FROM contacts
                    WHERE id = ANY($1) AND organization_id = $2
                `, [contact_ids, req.organizationId]);

                const orgResult = await client.query('SELECT name FROM organizations WHERE id = $1', [req.organizationId]);
                const organizationName = orgResult.rows[0]?.name || 'our business';
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

                const requests = [];
                
                for (const contact of contactsResult.rows) {
                    const uniqueToken = crypto.randomBytes(32).toString('hex');
                    const reviewLink = `${frontendUrl}/review/${uniqueToken}`;

                    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                    const messageContent = custom_message || `Hi ${contactName || 'there'},\n\nThank you for choosing ${organizationName}. We'd love to hear about your experience! Please take a moment to leave us a review:\n\n${reviewLink}\n\nThank you!`;

                    let emailSent = false;
                    let smsSent = false;

                    const activeChannel = channel || 'email';

                    if (activeChannel === 'email' || activeChannel === 'both') {
                        if (contact.email) {
                            const emailSubject = `We'd love your feedback on ${organizationName}`;
                            const emailHtml = `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2>How did we do?</h2>
                                    <p>${messageContent.replace(/\n/g, '<br>')}</p>
                                    <div style="margin-top: 20px;">
                                        <a href="${reviewLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Leave a Review</a>
                                    </div>
                                </div>
                            `;

                            try {
                                await emailService.sendEmail({
                                    to: contact.email,
                                    subject: emailSubject,
                                    html: emailHtml,
                                    text: messageContent
                                });
                                emailSent = true;
                            } catch (e) {
                                console.error('Error sending bulk email to', contact.email, e);
                            }
                        }
                    }

                    if (activeChannel === 'sms' || activeChannel === 'both') {
                        if (contact.phone) {
                            try {
                                await smsService.sendDirectSms({
                                    to: contact.phone,
                                    message: messageContent
                                });
                                smsSent = true;
                            } catch (e) {
                                console.error('Error sending bulk SMS to', contact.phone, e);
                            }
                        }
                    }

                    const result = await client.query(`
                        INSERT INTO review_requests (
                            organization_id, contact_id, contact_email, contact_phone, contact_name,
                            channel, custom_message, preferred_platform, unique_token, status,
                            email_sent, email_sent_at, sms_sent, sms_sent_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent', $10, $11, $12, $13)
                        RETURNING id
                    `, [
                        req.organizationId,
                        contact.id,
                        contact.email,
                        contact.phone,
                        contactName,
                        activeChannel,
                        custom_message || null,
                        preferred_platform || null,
                        uniqueToken,
                        emailSent,
                        emailSent ? new Date() : null,
                        smsSent,
                        smsSent ? new Date() : null
                    ]);

                    requests.push(result.rows[0]);
                }

                return requests;
            });
            res.status(201).json({ sent: requests.length, requests });
        } catch (error) {
            console.error('Error sending bulk requests:', error);
            return sendError(res, 'Failed to send bulk requests');
        }
    });

    // ======================

    return router;
};
