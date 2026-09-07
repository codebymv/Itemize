/**
 * Archive: a card or frame leaves the canvas without being deleted. One
 * nullable timestamp per table; reads default to `archived_at IS NULL`.
 * Vaults are left out until the vault module learns to archive.
 */
const ARCHIVABLE_TABLES = ['lists', 'notes', 'whiteboards', 'wireframes', 'workspace_frames'];

async function runWorkspaceArchiveMigration(pool) {
  for (const table of ARCHIVABLE_TABLES) {
    await pool.query(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
      CREATE INDEX IF NOT EXISTS idx_${table}_archived
        ON ${table}(user_id, archived_at DESC)
        WHERE archived_at IS NOT NULL;
    `);
  }
  return true;
}

module.exports = { runWorkspaceArchiveMigration, ARCHIVABLE_TABLES };
