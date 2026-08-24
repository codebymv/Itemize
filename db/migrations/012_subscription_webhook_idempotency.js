const { runSubscriptionWebhookMigration } = require('../../src/db_subscription_webhook_migrations');

exports.up = runSubscriptionWebhookMigration;

exports.down = async function down(pool) {
    await pool.query('DROP TABLE IF EXISTS stripe_subscription_webhook_events');
    await pool.query('ALTER TABLE organizations DROP COLUMN IF EXISTS subscription_provider_updated_at');
};
