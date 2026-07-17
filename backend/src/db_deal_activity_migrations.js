const { workflowTriggerSqlList } = require('./domain/workflowRegistry');

async function runDealActivityMigration(pool) {
  await pool.query(`
    UPDATE deals
    SET
      won_at = CASE
        WHEN won_at IS NOT NULL AND lost_at IS NOT NULL AND won_at >= lost_at
          THEN won_at
        WHEN lost_at IS NOT NULL THEN NULL
        ELSE won_at
      END,
      lost_at = CASE
        WHEN won_at IS NOT NULL AND lost_at IS NOT NULL AND won_at >= lost_at
          THEN NULL
        ELSE lost_at
      END
    WHERE won_at IS NOT NULL AND lost_at IS NOT NULL
  `);
  await pool.query(`
    UPDATE deals SET lost_reason = NULL
    WHERE lost_at IS NULL AND lost_reason IS NOT NULL
  `);
  await pool.query(`
    ALTER TABLE deals
      DROP CONSTRAINT IF EXISTS deals_terminal_state_check,
      DROP CONSTRAINT IF EXISTS deals_lost_reason_check
  `);
  await pool.query(`
    ALTER TABLE deals
      ADD CONSTRAINT deals_terminal_state_check
        CHECK (NOT (won_at IS NOT NULL AND lost_at IS NOT NULL)),
      ADD CONSTRAINT deals_lost_reason_check
        CHECK (lost_at IS NOT NULL OR lost_reason IS NULL)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_id_organization
      ON deals(id, organization_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_id_organization
      ON contacts(id, organization_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deal_activities (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deal_id INTEGER NOT NULL,
      contact_id INTEGER,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(50) NOT NULL CHECK (
        kind IN ('stage_changed', 'won', 'lost', 'reopened')
      ),
      from_stage_id VARCHAR(100),
      to_stage_id VARCHAR(100),
      from_state VARCHAR(20),
      to_state VARCHAR(20),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT deal_activities_deal_org_fk
        FOREIGN KEY (deal_id, organization_id)
        REFERENCES deals(id, organization_id) ON DELETE CASCADE,
      CONSTRAINT deal_activities_contact_org_fk
        FOREIGN KEY (contact_id, organization_id)
        REFERENCES contacts(id, organization_id) ON DELETE SET NULL (contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_created
      ON deal_activities(organization_id, deal_id, created_at DESC, id DESC)
  `);
  await pool.query(`
    ALTER TABLE workflows
      DROP CONSTRAINT IF EXISTS workflows_trigger_type_check
  `);
  await pool.query(`
    ALTER TABLE workflows
      ADD CONSTRAINT workflows_trigger_type_check
      CHECK (trigger_type IN (${workflowTriggerSqlList}))
  `);
  await pool.query(`
    ALTER TABLE workflow_triggers
      DROP CONSTRAINT IF EXISTS workflow_triggers_trigger_type_check
  `);
  await pool.query(`
    ALTER TABLE workflow_triggers
      ADD CONSTRAINT workflow_triggers_trigger_type_check
      CHECK (trigger_type IN (${workflowTriggerSqlList}))
  `);
  return true;
}

module.exports = { runDealActivityMigration };
