exports.up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'Solo',
                description = 'Contacts, invoices, e-signatures, and a workspace for freelancers',
                price_monthly = 29.00,
                price_yearly = 290.00,
                stripe_price_id_monthly = 'price_1U5ypmRxBJaRlFvtCDKzCKSC'
            WHERE name = 'starter'
        `);
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'Studio',
                description = 'Unlimited signatures and higher limits for small studios',
                price_monthly = 49.00,
                price_yearly = 490.00,
                stripe_price_id_monthly = 'price_1U5yqFRxBJaRlFvtcC8I6bbo'
            WHERE name = 'unlimited'
        `);
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'Studio+',
                description = 'Legacy agency tier — not offered to new buyers',
                price_monthly = 99.00,
                price_yearly = 990.00
            WHERE name = 'pro'
        `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.down = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'Starter',
                description = 'Perfect for solo operators and small businesses getting started',
                price_monthly = 97.00,
                price_yearly = 970.00
            WHERE name = 'starter'
        `);
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'Agency Unlimited',
                description = 'For growing agencies managing multiple clients',
                price_monthly = 297.00,
                price_yearly = 2970.00
            WHERE name = 'unlimited'
        `);
        await client.query(`
            UPDATE subscription_plans
            SET
                display_name = 'SaaS Pro',
                description = 'Build your own SaaS business with white-label and reselling',
                price_monthly = 497.00,
                price_yearly = 4970.00
            WHERE name = 'pro'
        `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
