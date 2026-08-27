const {
  runOrganizationInvitationsMigration,
} = require('../src/db_organization_lifecycle_migrations');

exports.up = runOrganizationInvitationsMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS organization_invitations');
};
