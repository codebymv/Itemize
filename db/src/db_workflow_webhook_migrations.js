async function runWorkflowWebhookIdempotencyMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_triggers (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      trigger_type VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      status VARCHAR(20) DEFAULT 'pending',
      error_message TEXT,
      processed_at TIMESTAMP WITH TIME ZONE,
      delivery_key VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    ALTER TABLE workflow_triggers
    ADD COLUMN IF NOT EXISTS delivery_key VARCHAR(255)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow
    ON workflow_triggers(workflow_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_entity
    ON workflow_triggers(entity_type, entity_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_triggers_delivery
    ON workflow_triggers(workflow_id, delivery_key)
    WHERE delivery_key IS NOT NULL
  `);
  return true;
}

module.exports = { runWorkflowWebhookIdempotencyMigration };
