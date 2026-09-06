/**
 * Frames: named regions on the canvas. Membership is spatial (a card belongs
 * to the frame whose rectangle contains its centre), so no card table changes;
 * the creation-receipt CHECK widens so frame creation replays like the rest.
 */
async function runWorkspaceFramesMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_frames (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL DEFAULT 'Untitled frame',
      color_value VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
      position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
      position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
      width DOUBLE PRECISION NOT NULL DEFAULT 1400
        CHECK (width >= 200 AND width <= 10000),
      height DOUBLE PRECISION NOT NULL DEFAULT 900
        CHECK (height >= 200 AND height <= 10000),
      z_index INTEGER NOT NULL DEFAULT 0,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_frames_user
      ON workspace_frames(user_id, created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_workspace_frames_contact
      ON workspace_frames(contact_id)
      WHERE contact_id IS NOT NULL;

    ALTER TABLE workspace_creation_receipts
      DROP CONSTRAINT IF EXISTS workspace_creation_receipts_entity_type_check;

    ALTER TABLE workspace_creation_receipts
      ADD CONSTRAINT workspace_creation_receipts_entity_type_check
      CHECK (entity_type IN ('list', 'note', 'whiteboard', 'wireframe', 'frame'));
  `);
  return true;
}

module.exports = { runWorkspaceFramesMigration };
