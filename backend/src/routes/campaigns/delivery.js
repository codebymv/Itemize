const emailService = require('../../services/emailService');
const { withDbClient } = require('../../utils/db');

/**
 * Background function to send campaign emails
 */
async function sendCampaignEmails(pool, campaignId, campaign, recipients) {
    console.log(`Starting to send campaign ${campaignId} to ${recipients.length} recipients`);

    await withDbClient(pool, async (client) => {
        let sentCount = 0;
        let failedCount = 0;
        const pendingUpdates = [];

        const htmlContent = campaign.content_html || campaign.template_html || '';
        const textContent = campaign.content_text || campaign.template_text || '';
        let lastStatusCheckTime = Date.now();
        let campaignStatus = 'sending';

        const flushUpdates = async () => {
            if (pendingUpdates.length === 0) {
                return;
            }

            const updateValues = [];
            const updateParams = [];
            pendingUpdates.forEach((update, index) => {
                const baseIndex = index * 6;
                updateParams.push(
                    campaignId,
                    update.contactId,
                    update.status,
                    update.sentAt,
                    update.externalMessageId,
                    update.errorMessage
                );
                updateValues.push(
                    `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
                );
            });

            await client.query(
                `
                    UPDATE campaign_recipients AS cr SET
                        status = v.status,
                        sent_at = v.sent_at,
                        external_message_id = v.external_message_id,
                        error_message = v.error_message,
                        updated_at = CURRENT_TIMESTAMP
                    FROM (
                        VALUES ${updateValues.join(', ')}
                    ) AS v(campaign_id, contact_id, status, sent_at, external_message_id, error_message)
                    WHERE cr.campaign_id = v.campaign_id AND cr.contact_id = v.contact_id
                `,
                updateParams
            );

            pendingUpdates.length = 0;
        };

        for (const recipient of recipients) {
            try {
                // Check campaign status at most once every 5 seconds to reduce DB load
                if (Date.now() - lastStatusCheckTime > 5000) {
                    lastStatusCheckTime = Date.now();
                    const statusCheck = await client.query(
                        'SELECT status FROM email_campaigns WHERE id = $1',
                        [campaignId]
                    );

                    if (statusCheck.rows.length) {
                        campaignStatus = statusCheck.rows[0].status;
                    } else {
                        campaignStatus = 'unknown';
                    }
                }

                if (campaignStatus !== 'sending') {
                    console.log(`Campaign ${campaignId} stopped - status: ${campaignStatus}`);
                    break;
                }

                const variables = {
                    first_name: recipient.first_name || '',
                    last_name: recipient.last_name || '',
                    email: recipient.email,
                    full_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim()
                };

                let processedHtml = htmlContent;
                let processedText = textContent;
                Object.entries(variables).forEach(([key, value]) => {
                    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
                    processedHtml = processedHtml.replace(regex, value);
                    processedText = processedText.replace(regex, value);
                });

                const result = await emailService.sendEmail({
                    to: recipient.email,
                    subject: campaign.subject,
                    html: processedHtml,
                    text: processedText,
                    fromName: campaign.from_name,
                    fromEmail: campaign.from_email,
                    replyTo: campaign.reply_to
                });

                pendingUpdates.push({
                    contactId: recipient.contact_id || recipient.id,
                    status: 'sent',
                    sentAt: new Date(),
                    externalMessageId: result?.id || null,
                    errorMessage: null
                });
                sentCount++;

                if (sentCount % 10 === 0) {
                    await client.query(`
                        UPDATE email_campaigns SET
                            total_sent = $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [sentCount, campaignId]);
                }

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`Failed to send to ${recipient.email}:`, error.message);
                failedCount++;

                pendingUpdates.push({
                    contactId: recipient.contact_id || recipient.id,
                    status: 'failed',
                    sentAt: null,
                    externalMessageId: null,
                    errorMessage: error.message
                });
            }

            if (pendingUpdates.length >= 10) {
                await flushUpdates();
            }
        }

        await flushUpdates();

        await client.query(`
            UPDATE email_campaigns SET
                status = 'sent',
                total_sent = $1,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [sentCount, campaignId]);

        console.log(`Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);
    });
}

module.exports = {
    sendCampaignEmails
};
