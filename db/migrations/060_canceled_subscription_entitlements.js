exports.up = async (pool) => {
    await pool.query(`
        UPDATE organizations
        SET plan = 'free',
            stripe_subscription_id = NULL,
            cancel_at_period_end = FALSE,
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
        WHERE subscription_status = 'canceled'
    `);
};

exports.down = async () => {};
