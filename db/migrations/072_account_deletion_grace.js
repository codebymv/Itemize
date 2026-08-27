const {
  runAccountDeletionGraceMigration,
} = require('../src/db_account_deletion_migrations');

exports.up = runAccountDeletionGraceMigration;

exports.down = async function down() {};
