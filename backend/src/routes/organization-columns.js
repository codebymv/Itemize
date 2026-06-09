const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const ORGANIZATION_COLUMNS = [
  'id',
  'name',
  'slug',
  'settings',
  'logo_url',
  'stripe_customer_id',
  'stripe_subscription_id',
  'plan',
  'subscription_status',
  'billing_period',
  'billing_period_start',
  'billing_period_end',
  'trial_ends_at',
  'trial_started_at',
  'emails_used',
  'emails_limit',
  'sms_used',
  'sms_limit',
  'api_calls_used',
  'api_calls_limit',
  'contacts_limit',
  'users_limit',
  'workflows_limit',
  'landing_pages_limit',
  'forms_limit',
  'calendars_limit',
  'current_plan_id',
  'features_override',
  'cancel_at_period_end',
  'canceled_at',
  'trial_end_acknowledged_at',
  'created_at',
  'updated_at'
];

const ORGANIZATION_MEMBER_COLUMNS = [
  'id',
  'organization_id',
  'user_id',
  'role',
  'invited_at',
  'joined_at',
  'invited_by'
];

const organizationColumns = (alias) => alias ? qualify(ORGANIZATION_COLUMNS, alias) : ORGANIZATION_COLUMNS.join(', ');
const organizationMemberColumns = (alias) => alias ? qualify(ORGANIZATION_MEMBER_COLUMNS, alias) : ORGANIZATION_MEMBER_COLUMNS.join(', ');

module.exports = {
  organizationColumns,
  organizationMemberColumns
};
