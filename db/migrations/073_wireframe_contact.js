const {
  runWireframeContactMigration,
} = require('../src/db_wireframe_contact_migrations');

exports.up = runWireframeContactMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS idx_wireframes_contact_id;');
  await pool.query(`
    ALTER TABLE wireframes
    DROP CONSTRAINT IF EXISTS wireframes_contact_id_fkey,
    DROP COLUMN IF EXISTS contact_id;
  `);
};
