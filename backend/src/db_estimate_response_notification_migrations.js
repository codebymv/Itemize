async function runEstimateResponseNotificationMigration(pool) {
  await pool.query(`
    ALTER TABLE estimate_email_deliveries
      ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(32);

    UPDATE estimate_email_deliveries
    SET delivery_type = 'estimate_sent'
    WHERE delivery_type IS NULL;

    ALTER TABLE estimate_email_deliveries
      ALTER COLUMN delivery_type SET DEFAULT 'estimate_sent';
    ALTER TABLE estimate_email_deliveries
      ALTER COLUMN delivery_type SET NOT NULL;

    ALTER TABLE estimate_email_deliveries
      DROP CONSTRAINT IF EXISTS estimate_email_delivery_type_check;
    ALTER TABLE estimate_email_deliveries
      ADD CONSTRAINT estimate_email_delivery_type_check
      CHECK (delivery_type IN (
        'estimate_sent',
        'estimate_accepted',
        'estimate_declined'
      ));

    ALTER TABLE estimate_email_deliveries
      DROP CONSTRAINT IF EXISTS estimate_email_delivery_idempotency;
    ALTER TABLE estimate_email_deliveries
      ADD CONSTRAINT estimate_email_delivery_idempotency
      UNIQUE (organization_id, estimate_id, delivery_type, idempotency_key);

    CREATE INDEX IF NOT EXISTS idx_estimate_email_deliveries_type_claim
      ON estimate_email_deliveries(delivery_type, status, next_attempt_at, id)
      WHERE status IN ('queued', 'retry', 'processing');
  `);

  return true;
}

module.exports = { runEstimateResponseNotificationMigration };
