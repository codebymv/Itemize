async function runWorkflowScheduleMigration(pool) {
  await pool.query(`
    ALTER TABLE workflows
      ADD COLUMN IF NOT EXISTS scheduled_contact_id
        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS next_trigger_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMP WITH TIME ZONE
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflows_scheduled_due
      ON workflows(next_trigger_at, id)
      WHERE trigger_type = 'scheduled'
        AND is_active = true
        AND next_trigger_at IS NOT NULL
  `);
  return true;
}

module.exports = { runWorkflowScheduleMigration };
