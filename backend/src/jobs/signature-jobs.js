/**
 * Signature Jobs
 * Handles reminders for pending signatures
 */

const { logger } = require('../utils/logger');
const { generateToken, hashToken } = require('../services/signature.service');
const signatureEmailService = require('../services/signature-email.service');

async function runSignatureReminderJobs(pool) {
    const client = await pool.connect();
    try {
        const reminders = await client.query(`
            SELECT
                sr.id AS reminder_id,
                sr.document_id,
                sr.recipient_id,
                r.email,
                r.name,
                r.routing_status,
                r.status AS recipient_status,
                d.title,
                d.message,
                d.sender_name,
                d.expires_at,
                d.routing_mode
            FROM signature_reminders sr
            JOIN signature_recipients r ON r.id = sr.recipient_id
            JOIN signature_documents d ON d.id = sr.document_id
            WHERE sr.status = 'pending' AND sr.scheduled_at <= CURRENT_TIMESTAMP
        `);

        for (const reminder of reminders.rows) {
            if (reminder.recipient_status === 'signed' || reminder.recipient_status === 'declined') {
                await client.query('UPDATE signature_reminders SET status = $1 WHERE id = $2', ['skipped', reminder.reminder_id]);
                continue;
            }
            if ((reminder.routing_mode || 'parallel') === 'sequential' && reminder.routing_status !== 'active') {
                continue;
            }

            const token = generateToken();
            const tokenHash = hashToken(token);
            await client.query(`
                UPDATE signature_recipients SET
                    signing_token_hash = $1,
                    token_expires_at = $2,
                    status = 'sent',
                    sent_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [tokenHash, reminder.expires_at || null, reminder.recipient_id]);

            if (signatureEmailService) {
                const signingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/sign/${token}`;
                await signatureEmailService.sendSignatureReminder({
                    to: reminder.email,
                    recipientName: reminder.name,
                    documentTitle: reminder.title,
                    senderName: reminder.sender_name || 'Itemize',
                    message: reminder.message,
                    signingUrl,
                    expiresAt: reminder.expires_at
                });
            }

            await client.query(`
                UPDATE signature_reminders SET
                    status = 'sent',
                    sent_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [reminder.reminder_id]);

            await client.query(`
                INSERT INTO signature_audit_log (document_id, recipient_id, event_type, description, created_at)
                VALUES ($1, $2, 'reminder_sent', 'Signature reminder sent', CURRENT_TIMESTAMP)
            `, [reminder.document_id, reminder.recipient_id]);
        }
    } catch (error) {
        logger.error('Error running signature reminder jobs', { error: error.message });
    } finally {
        client.release();
    }
}

module.exports = {
    runSignatureReminderJobs
};
