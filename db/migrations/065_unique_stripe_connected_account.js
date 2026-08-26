exports.up = async function up(pool) {
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_settings_stripe_account
    ON payment_settings(stripe_account_id)
    WHERE stripe_account_id IS NOT NULL AND stripe_account_id <> ''
  `);
};

exports.down = async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS ux_payment_settings_stripe_account
  `);
};
