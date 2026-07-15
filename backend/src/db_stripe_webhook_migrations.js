async function runStripeWebhookIdempotencyMigration(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stripe_webhook_events (
            event_id VARCHAR(255) PRIMARY KEY,
            event_type VARCHAR(100) NOT NULL,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
        ON stripe_webhook_events(processed_at)
    `);
    return true;
}

module.exports = { runStripeWebhookIdempotencyMigration };
