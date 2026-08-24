const { workflowTriggerSqlList } = require('./domain/workflowRegistry');

async function runWorkflowTriggerQueueMigration(pool) {
  await pool.query(`
    ALTER TABLE workflow_triggers
      ALTER COLUMN workflow_id DROP NOT NULL,
      ALTER COLUMN status SET DEFAULT 'queued',
      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS event_key VARCHAR(255),
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'webhook',
      ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    UPDATE workflow_triggers trigger
    SET organization_id = workflow.organization_id
    FROM workflows workflow
    WHERE trigger.organization_id IS NULL
      AND trigger.workflow_id = workflow.id
  `);
  await pool.query(`
    UPDATE workflow_triggers
    SET status = 'queued',
        next_attempt_at = COALESCE(next_attempt_at, created_at, CURRENT_TIMESTAMP)
    WHERE status = 'pending'
  `);
  await pool.query(`
    ALTER TABLE workflow_triggers
      ALTER COLUMN organization_id SET NOT NULL,
      DROP CONSTRAINT IF EXISTS workflow_triggers_status_check,
      DROP CONSTRAINT IF EXISTS workflow_triggers_source_check,
      DROP CONSTRAINT IF EXISTS workflow_triggers_trigger_type_check
  `);
  await pool.query(`
    ALTER TABLE workflow_triggers
      ADD CONSTRAINT workflow_triggers_status_check
        CHECK (status IN ('queued', 'processing', 'retry', 'completed', 'dead_letter')),
      ADD CONSTRAINT workflow_triggers_source_check
        CHECK (source IN ('domain', 'webhook')),
      ADD CONSTRAINT workflow_triggers_trigger_type_check
        CHECK (trigger_type IN (${workflowTriggerSqlList}))
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_triggers_event_key
      ON workflow_triggers(event_key)
      WHERE event_key IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_queue
      ON workflow_triggers(
        COALESCE(next_attempt_at, created_at),
        COALESCE(lease_expires_at, created_at),
        id
      )
      WHERE status IN ('queued', 'retry', 'processing')
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_org_type
      ON workflow_triggers(organization_id, trigger_type, created_at)
  `);
  return true;
}

module.exports = { runWorkflowTriggerQueueMigration };
