const ITEMIZE_SOLO_MONTHLY = 'price_1U78itEHPD0TpM72ybhQuqwH';
const ITEMIZE_STUDIO_MONTHLY = 'price_1U78jKEHPD0TpM72XLrdBuO5';

exports.up = async (pool) => {
    await pool.query(
        `UPDATE subscription_plans
         SET stripe_price_id_monthly = CASE name
             WHEN 'starter' THEN $1
             WHEN 'unlimited' THEN $2
             ELSE stripe_price_id_monthly
         END,
         updated_at = CURRENT_TIMESTAMP
         WHERE name IN ('starter', 'unlimited')`,
        [ITEMIZE_SOLO_MONTHLY, ITEMIZE_STUDIO_MONTHLY]
    );
};

exports.down = async (pool) => {
    await pool.query(
        `UPDATE subscription_plans
         SET stripe_price_id_monthly = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE name IN ('starter', 'unlimited')`
    );
};
