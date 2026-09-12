/** Existing accounts retain initials until they select a preset. */
async function runUserAvatarMigration(pool) {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(64);');
  return true;
}
module.exports = { runUserAvatarMigration };
