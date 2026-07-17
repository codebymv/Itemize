const {
  runDealActivityMigration,
} = require('../../src/db_deal_activity_migrations');

exports.up = runDealActivityMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS deal_activities');
  await pool.query(`
    ALTER TABLE deals
      DROP CONSTRAINT IF EXISTS deals_terminal_state_check,
      DROP CONSTRAINT IF EXISTS deals_lost_reason_check
  `);
};
