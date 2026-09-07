const {
  runWorkspaceArchiveMigration,
  ARCHIVABLE_TABLES,
} = require('../src/db_workspace_archive_migrations');

exports.up = runWorkspaceArchiveMigration;

exports.down = async function down(pool) {
  for (const table of ARCHIVABLE_TABLES) {
    await pool.query(`
      DROP INDEX IF EXISTS idx_${table}_archived;
      ALTER TABLE ${table} DROP COLUMN IF EXISTS archived_at;
    `);
  }
};
