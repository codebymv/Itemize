const {
    runActivationEventsMigration,
} = require('../../src/db_activation_events_migrations');

exports.up = runActivationEventsMigration;

exports.down = async function down(pool) {
    await pool.query('DROP TABLE IF EXISTS activation_events;');
};
