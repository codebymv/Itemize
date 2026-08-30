async function runMessageDeliveryMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_delivery_jobs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_fingerprint CHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL CHECK (
        kind IN ('contact_email', 'contact_sms', 'test_email', 'test_sms')
      ),
      channel VARCHAR(8) NOT NULL CHECK (channel IN ('email', 'sms')),
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      email_template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
      sms_template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
      message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (
        status IN (
          'queued', 'processing', 'retry', 'provider_accepted',
          'dead_letter', 'reconciliation_required'
        )
      ),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lease_expires_at TIMESTAMP WITH TIME ZONE,
      claimed_by VARCHAR(255),
      provider_id VARCHAR(255),
      email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
      sms_log_id INTEGER REFERENCES sms_logs(id) ON DELETE SET NULL,
      contact_activity_id INTEGER REFERENCES contact_activities(id) ON DELETE SET NULL,
      last_error TEXT,
      accepted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT message_delivery_job_idempotency
        UNIQUE (organization_id, idempotency_key),
      CONSTRAINT message_delivery_job_kind_channel CHECK (
        (kind IN ('contact_email', 'test_email') AND channel = 'email')
        OR (kind IN ('contact_sms', 'test_sms') AND channel = 'sms')
      ),
      CONSTRAINT message_delivery_job_contact CHECK (
        (kind IN ('contact_email', 'contact_sms') AND contact_id IS NOT NULL)
        OR (kind IN ('test_email', 'test_sms') AND contact_id IS NULL)
      ),
      CONSTRAINT message_delivery_job_template CHECK (
        (channel = 'email' AND sms_template_id IS NULL)
        OR (channel = 'sms' AND email_template_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_message_delivery_jobs_claim
      ON message_delivery_jobs(status, next_attempt_at, id)
      WHERE status IN ('queued', 'retry', 'processing');
    CREATE INDEX IF NOT EXISTS idx_message_delivery_jobs_org_created
      ON message_delivery_jobs(organization_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_message_delivery_jobs_contact
      ON message_delivery_jobs(organization_id, contact_id, created_at DESC)
      WHERE contact_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_delivery_jobs_email_provider
      ON message_delivery_jobs(provider_id)
      WHERE channel = 'email' AND provider_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_delivery_jobs_sms_provider
      ON message_delivery_jobs(provider_id)
      WHERE channel = 'sms' AND provider_id IS NOT NULL;
  `);
  return true;
}

async function runMessageDeliveryConversationLinkMigration(pool) {
  await pool.query(`
    ALTER TABLE message_delivery_jobs
      ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_message_delivery_jobs_conversation
      ON message_delivery_jobs(organization_id, conversation_id, created_at DESC)
      WHERE conversation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_delivery_jobs_message
      ON message_delivery_jobs(message_id)
      WHERE message_id IS NOT NULL;
  `);
  return true;
}

module.exports = {
  runMessageDeliveryMigration,
  runMessageDeliveryConversationLinkMigration,
};
