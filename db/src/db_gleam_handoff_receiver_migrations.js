const runGleamHandoffReceiverMigration = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gleam_connections (
      id UUID PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_organization_id VARCHAR(128) NOT NULL,
      generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
      state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','revoked')),
      key_id VARCHAR(128) NOT NULL,
      public_key TEXT NOT NULL,
      source_approved_at TIMESTAMPTZ,
      target_approved_at TIMESTAMPTZ,
      target_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      default_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_after_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (due_after_minutes BETWEEN 1 AND 43200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (state <> 'active' OR (source_approved_at IS NOT NULL AND target_approved_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gleam_active_target ON gleam_connections(organization_id) WHERE state='active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gleam_active_source ON gleam_connections(source_organization_id) WHERE state='active';
    CREATE OR REPLACE FUNCTION enforce_gleam_connection_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.source_organization_id IS DISTINCT FROM OLD.source_organization_id THEN
        RAISE EXCEPTION 'Gleam connection organization pair is immutable';
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS gleam_connection_identity_guard ON gleam_connections;
    CREATE TRIGGER gleam_connection_identity_guard BEFORE UPDATE ON gleam_connections
      FOR EACH ROW EXECUTE FUNCTION enforce_gleam_connection_identity();
    CREATE TABLE IF NOT EXISTS gleam_handoff_sources (
      connection_id UUID NOT NULL REFERENCES gleam_connections(id) ON DELETE CASCADE,
      handoff_id VARCHAR(128) NOT NULL,
      source_fingerprint CHAR(64) NOT NULL,
      call_id VARCHAR(128) NOT NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      activity_id INTEGER REFERENCES contact_activities(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(connection_id,handoff_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gleam_handoff_task ON gleam_handoff_sources(task_id) WHERE task_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS gleam_handoff_inbox (
      connection_id UUID NOT NULL REFERENCES gleam_connections(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL CHECK (generation > 0),
      event_id UUID NOT NULL,
      fingerprint CHAR(64) NOT NULL,
      receipt JSONB NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(connection_id,generation,event_id)
    );
  `);
};
module.exports = { runGleamHandoffReceiverMigration };
