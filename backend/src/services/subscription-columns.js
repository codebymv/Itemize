const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const subscriptionPlanColumnNames = [
    'id',
    'name',
    'display_name',
    'description',
    'tier_level',
    'price_monthly',
    'price_yearly',
    'stripe_price_id_monthly',
    'stripe_price_id_yearly',
    'features',
    'limits',
    'is_active',
    'is_default',
    'trial_days',
    'sort_order',
    'created_at',
    'updated_at'
];

const subscriptionColumnNames = [
    'id',
    'organization_id',
    'plan_id',
    'status',
    'stripe_customer_id',
    'stripe_subscription_id',
    'billing_period',
    'current_period_start',
    'current_period_end',
    'trial_start',
    'trial_end',
    'canceled_at',
    'cancel_at_period_end',
    'pause_collection',
    'metadata',
    'created_at',
    'updated_at'
];

const subscriptionPlanColumns = (alias) => qualify(subscriptionPlanColumnNames, alias);
const subscriptionColumns = (alias) => qualify(subscriptionColumnNames, alias);

module.exports = {
    subscriptionPlanColumns,
    subscriptionColumns,
    subscriptionPlanColumnNames,
    subscriptionColumnNames
};
