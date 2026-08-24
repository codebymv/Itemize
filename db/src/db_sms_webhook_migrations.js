/**
 * Durable claims for Twilio delivery callbacks.
 *
 * Provider retries are normal. Claims live outside sms_logs because a single
 * outbound MessageSid can legitimately receive several distinct status events.
 */
const runSmsWebhookIdempotencyMigration = async (pool) => {
  await pool.query(`
    ALTER TABLE contact_activities
      DROP CONSTRAINT IF EXISTS contact_activities_type_check
  `);
  await pool.query(`
    ALTER TABLE contact_activities
      ADD CONSTRAINT contact_activities_type_check
      CHECK (type IN ('note', 'email', 'sms', 'call', 'task', 'meeting', 'status_change', 'deal_update', 'system'))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_webhook_events (
      event_key VARCHAR(600) PRIMARY KEY,
      event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('inbound', 'status')),
      external_id VARCHAR(255) NOT NULL,
      received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_webhook_events_external_id
      ON sms_webhook_events(external_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_webhook_events_received_at
      ON sms_webhook_events(received_at DESC)
  `);

  return true;
};

const runSmsReceivingNumberRegistryMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_receiving_numbers (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      phone_number VARCHAR(20) NOT NULL UNIQUE
        CHECK (phone_number ~ '^\\+[1-9][0-9]{6,14}$'),
      provider VARCHAR(20) NOT NULL DEFAULT 'twilio'
        CHECK (provider IN ('twilio')),
      provider_number_id VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_receiving_numbers_organization
      ON sms_receiving_numbers(organization_id, is_active, phone_number)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_receiving_numbers_primary
      ON sms_receiving_numbers(organization_id, provider)
      WHERE is_active = TRUE AND is_primary = TRUE
  `);

  await pool.query(`
    ALTER TABLE sms_webhook_events
      ADD COLUMN IF NOT EXISTS organization_id INTEGER
        REFERENCES organizations(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS contact_id INTEGER
        REFERENCES contacts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS to_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS from_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) NOT NULL DEFAULT 'processed'
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sms_webhook_events_processing_status_check'
      ) THEN
        ALTER TABLE sms_webhook_events
          ADD CONSTRAINT sms_webhook_events_processing_status_check
          CHECK (processing_status IN (
            'pending', 'processed', 'unmatched_receiver',
            'unmatched_sender', 'ambiguous_sender'
          ));
      END IF;
    END $$
  `);

  await pool.query(`
    ALTER TABLE sms_webhook_events
      ALTER COLUMN processing_status SET DEFAULT 'pending'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_webhook_events_routing_status
      ON sms_webhook_events(processing_status, received_at DESC)
      WHERE event_type = 'inbound'
  `);

  return true;
};

module.exports = {
  runSmsReceivingNumberRegistryMigration,
  runSmsWebhookIdempotencyMigration,
};
