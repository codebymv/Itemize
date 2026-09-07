/**
 * A user's theme colour: the product accent every application surface reads
 * (buttons, chrome icons, rings, favicon, new-card default). Blue is the
 * default the app shipped with; the backend validates the value against the
 * palette (blue | purple | pink) so a status colour can never be chosen.
 */
async function runUserThemeColorMigration(pool) {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS theme_color VARCHAR(16) NOT NULL DEFAULT 'blue';
  `);
  return true;
}

module.exports = { runUserThemeColorMigration };
