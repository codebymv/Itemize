const runClientTaskLifecycleMigration = async (pool) => {
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
    CREATE TABLE IF NOT EXISTS client_task_mutation_receipts (
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      fingerprint CHAR(64) NOT NULL,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, actor_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS client_task_audit (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(32) NOT NULL,
      task_version INTEGER NOT NULL,
      before_state JSONB,
      after_state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_client_tasks_org_due ON tasks(organization_id, due_date, id);
    CREATE INDEX IF NOT EXISTS idx_client_tasks_org_assignee_status_due ON tasks(organization_id, assigned_to, status, due_date, id);
    CREATE INDEX IF NOT EXISTS idx_client_task_audit_task ON client_task_audit(organization_id, task_id, id);
  `);
};

module.exports = { runClientTaskLifecycleMigration };
