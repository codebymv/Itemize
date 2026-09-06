const {
  runWorkspaceReferencesMigration,
} = require('../src/db_workspace_references_migrations');

exports.up = runWorkspaceReferencesMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS workspace_references;');
};
