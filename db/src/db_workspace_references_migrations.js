/**
 * Inline references from workspace cards to CRM and money entities.
 * A card that mentions a client (@) or a money document ($) gets one row per
 * distinct target so the entity's page can list where it is referenced and
 * the owner projection can hydrate live status. Ownership is the card's
 * owner; nothing here is tenant-scoped on its own.
 */
async function runWorkspaceReferencesMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_references (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_type VARCHAR(16) NOT NULL
        CHECK (source_type IN ('list', 'note', 'whiteboard', 'wireframe')),
      source_id INTEGER NOT NULL,
      entity_type VARCHAR(16) NOT NULL
        CHECK (entity_type IN ('contact', 'invoice', 'estimate', 'payment')),
      entity_id INTEGER NOT NULL,
      label VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id, entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_references_entity
      ON workspace_references(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_references_source
      ON workspace_references(user_id, source_type, source_id);
  `);
  return true;
}

module.exports = { runWorkspaceReferencesMigration };
