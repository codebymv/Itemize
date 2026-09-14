const { runAdminMfaMigration } = require('../src/db_admin_mfa_migrations');
exports.up = runAdminMfaMigration;
// Retain authentication and audit evidence. Old images must not bypass MFA.
exports.down = async () => {};
