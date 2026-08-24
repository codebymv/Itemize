const {
  runTrialReminderDeliveryMigration,
} = require('../../src/db_trial_reminder_delivery_migrations');

exports.up = runTrialReminderDeliveryMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS trial_reminder_deliveries');
};
