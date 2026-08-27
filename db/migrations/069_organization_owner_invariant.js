const {
  runOrganizationOwnerInvariantMigration,
} = require('../src/db_organization_lifecycle_migrations');

exports.up = runOrganizationOwnerInvariantMigration;

exports.down = async function down(pool) {
  await pool.query('DROP INDEX IF EXISTS uq_organization_members_single_owner');
};
