const {
  runOrganizationAllowanceMigration,
} = require('../src/db_organization_allowance_migrations');

exports.up = runOrganizationAllowanceMigration;

exports.down = async function down() {};
