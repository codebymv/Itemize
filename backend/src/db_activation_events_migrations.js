async function runActivationEventsMigration(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS activation_events (
            id BIGSERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            event_name VARCHAR(80) NOT NULL,
            artifact_type VARCHAR(40),
            artifact_id BIGINT,
            source VARCHAR(100) NOT NULL,
            dedupe_key VARCHAR(255) NOT NULL UNIQUE,
            properties JSONB NOT NULL DEFAULT '{}'::jsonb,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT activation_events_artifact_pair CHECK (
                (artifact_type IS NULL AND artifact_id IS NULL)
                OR (artifact_type IS NOT NULL AND artifact_id IS NOT NULL AND artifact_id > 0)
            )
        );

        CREATE INDEX IF NOT EXISTS idx_activation_events_org_event_time
            ON activation_events (organization_id, event_name, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_activation_events_artifact
            ON activation_events (organization_id, artifact_type, artifact_id);
    `);
}

module.exports = { runActivationEventsMigration };
