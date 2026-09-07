const {
  runWorkspaceFrameCategoryMigration,
} = require('../src/db_workspace_frame_category_migrations');

exports.up = runWorkspaceFrameCategoryMigration;

exports.down = async function down(pool) {
  await pool.query('ALTER TABLE workspace_frames DROP COLUMN IF EXISTS category;');
};
