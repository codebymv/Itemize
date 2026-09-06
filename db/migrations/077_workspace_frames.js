const {
  runWorkspaceFramesMigration,
} = require('../src/db_workspace_frames_migrations');

exports.up = runWorkspaceFramesMigration;

exports.down = async function down(pool) {
  await pool.query(`
    DELETE FROM workspace_creation_receipts WHERE entity_type = 'frame';
    ALTER TABLE workspace_creation_receipts
      DROP CONSTRAINT IF EXISTS workspace_creation_receipts_entity_type_check;
    ALTER TABLE workspace_creation_receipts
      ADD CONSTRAINT workspace_creation_receipts_entity_type_check
      CHECK (entity_type IN ('list', 'note', 'whiteboard', 'wireframe'));
    DROP TABLE IF EXISTS workspace_frames;
  `);
};
