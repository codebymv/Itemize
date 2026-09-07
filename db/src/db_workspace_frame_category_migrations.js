/**
 * A frame can carry a category that flows down onto the cards inside it
 * (the same way its client does). Null means the frame pushes nothing.
 */
async function runWorkspaceFrameCategoryMigration(pool) {
  await pool.query(`
    ALTER TABLE workspace_frames
      ADD COLUMN IF NOT EXISTS category VARCHAR(100);
  `);
  return true;
}

module.exports = { runWorkspaceFrameCategoryMigration };
