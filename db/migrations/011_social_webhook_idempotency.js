const { runSocialWebhookMigration } = require('../../src/db_social_webhook_migrations');

exports.up = runSocialWebhookMigration;

exports.down = async function down(pool) {
    await pool.query('DROP TABLE IF EXISTS social_webhook_events');
    await pool.query('DROP INDEX IF EXISTS idx_social_messages_channel_external_unique');
};
