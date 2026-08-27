async function runOrganizationAllowanceMigration(pool) {
  await pool.query(`
    ALTER TABLE organizations
      ALTER COLUMN plan SET DEFAULT 'free',
      ALTER COLUMN subscription_status SET DEFAULT 'none',
      ALTER COLUMN emails_limit SET DEFAULT 0,
      ALTER COLUMN sms_limit SET DEFAULT 0,
      ALTER COLUMN api_calls_limit SET DEFAULT 0,
      ALTER COLUMN contacts_limit SET DEFAULT 0,
      ALTER COLUMN users_limit SET DEFAULT 1,
      ALTER COLUMN workflows_limit SET DEFAULT 0,
      ALTER COLUMN landing_pages_limit SET DEFAULT 0,
      ALTER COLUMN forms_limit SET DEFAULT 0,
      ALTER COLUMN calendars_limit SET DEFAULT 0;

    UPDATE organizations
    SET plan = 'free',
        emails_limit = 0,
        sms_limit = 0,
        api_calls_limit = 0,
        contacts_limit = 0,
        users_limit = 1,
        workflows_limit = 0,
        landing_pages_limit = 0,
        forms_limit = 0,
        calendars_limit = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE plan = 'starter'
      AND subscription_status = 'none'
      AND stripe_customer_id IS NULL
      AND stripe_subscription_id IS NULL
      AND trial_started_at IS NULL;
  `);
  return true;
}

module.exports = { runOrganizationAllowanceMigration };
