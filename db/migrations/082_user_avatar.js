const { runUserAvatarMigration } = require('../src/db_user_avatar_migrations');
exports.up = runUserAvatarMigration;
exports.down = async pool => { await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS avatar_key'); };
