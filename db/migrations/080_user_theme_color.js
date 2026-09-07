const {
  runUserThemeColorMigration,
} = require('../src/db_user_theme_color_migrations');

exports.up = runUserThemeColorMigration;

exports.down = async function down(pool) {
  await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS theme_color;');
};
