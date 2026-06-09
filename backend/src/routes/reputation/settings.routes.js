const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Settings
    // ======================

    /**
     * GET /api/reputation/settings - Get settings
     */
    router.get('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const result = await withDbClient(pool, async (client) => client.query(
                'SELECT * FROM reputation_settings WHERE organization_id = $1',
                [req.organizationId]
            ));

            if (result.rows.length === 0) {
                return res.json({
                    auto_request_enabled: false,
                    auto_request_delay_days: 3,
                    auto_request_channel: 'email',
                    negative_threshold: 3,
                    negative_route_internal: true,
                    new_review_notify_email: true
                });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching settings:', error);
            return sendError(res, 'Failed to fetch settings');
        }
    });

    /**
     * PUT /api/reputation/settings - Update settings
     */
    router.put('/settings', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const settings = req.body;
            const result = await withDbClient(pool, async (client) => client.query(`
                INSERT INTO reputation_settings (
                    organization_id, auto_request_enabled, auto_request_delay_days, auto_request_channel,
                    auto_request_trigger, email_template_id, sms_template_text, negative_threshold,
                    negative_alert_email, negative_route_internal, positive_route_url, default_review_url,
                    google_place_id, new_review_notify_email, new_review_notify_slack, slack_webhook_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (organization_id) DO UPDATE SET
                    auto_request_enabled = COALESCE(EXCLUDED.auto_request_enabled, reputation_settings.auto_request_enabled),
                    auto_request_delay_days = COALESCE(EXCLUDED.auto_request_delay_days, reputation_settings.auto_request_delay_days),
                    auto_request_channel = COALESCE(EXCLUDED.auto_request_channel, reputation_settings.auto_request_channel),
                    auto_request_trigger = COALESCE(EXCLUDED.auto_request_trigger, reputation_settings.auto_request_trigger),
                    email_template_id = EXCLUDED.email_template_id,
                    sms_template_text = EXCLUDED.sms_template_text,
                    negative_threshold = COALESCE(EXCLUDED.negative_threshold, reputation_settings.negative_threshold),
                    negative_alert_email = EXCLUDED.negative_alert_email,
                    negative_route_internal = COALESCE(EXCLUDED.negative_route_internal, reputation_settings.negative_route_internal),
                    positive_route_url = EXCLUDED.positive_route_url,
                    default_review_url = EXCLUDED.default_review_url,
                    google_place_id = EXCLUDED.google_place_id,
                    new_review_notify_email = COALESCE(EXCLUDED.new_review_notify_email, reputation_settings.new_review_notify_email),
                    new_review_notify_slack = COALESCE(EXCLUDED.new_review_notify_slack, reputation_settings.new_review_notify_slack),
                    slack_webhook_url = EXCLUDED.slack_webhook_url,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                req.organizationId,
                settings.auto_request_enabled,
                settings.auto_request_delay_days,
                settings.auto_request_channel,
                settings.auto_request_trigger,
                settings.email_template_id,
                settings.sms_template_text,
                settings.negative_threshold,
                settings.negative_alert_email,
                settings.negative_route_internal,
                settings.positive_route_url,
                settings.default_review_url,
                settings.google_place_id,
                settings.new_review_notify_email,
                settings.new_review_notify_slack,
                settings.slack_webhook_url
            ]));
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating settings:', error);
            return sendError(res, 'Failed to update settings');
        }
    });

    // ======================

    return router;
};
