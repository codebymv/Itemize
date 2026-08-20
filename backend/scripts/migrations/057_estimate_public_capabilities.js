const {
    runEstimatePublicCapabilityMigration,
} = require('../../src/db_estimate_public_capability_migrations');

exports.up = runEstimatePublicCapabilityMigration;

exports.down = async function down(pool) {
    await pool.query(`
      DROP TRIGGER IF EXISTS estimate_public_capability_tenant
        ON estimate_public_capabilities;
      DROP FUNCTION IF EXISTS enforce_estimate_public_capability_tenant();
      DROP TABLE IF EXISTS estimate_public_capabilities;
    `);
};
