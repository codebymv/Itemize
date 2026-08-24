/**
 * Test-support copy of the personal-organization bootstrap that the
 * retired Express service performed at signup
 * (backend/src/auth/helpers.js createPersonalOrganization +
 * backend/src/routes/organization-columns.js). TestDbHelper seeds
 * users through this so integration fixtures match the production
 * signup shape.
 */
const { logger } = require('../src/utils/logger');

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
  'updated_at',
];

const organizationColumns = () => ORGANIZATION_COLUMNS.join(', ');

const createPersonalOrganization = async (client, userId, userName) => {
  try {
    const slug = (userName || `user${userId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + `-${userId}`;

    const orgResult = await client.query(`
      INSERT INTO organizations (name, slug, settings)
      VALUES ($1, $2, $3)
      RETURNING ${organizationColumns()}
    `, [`${userName}'s Workspace`, slug, JSON.stringify({ personal: true })]);

    const organization = orgResult.rows[0];

    await client.query(`
      INSERT INTO organization_members (organization_id, user_id, role, joined_at)
      VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
    `, [organization.id, userId]);

    await client.query(`
      UPDATE users
      SET default_organization_id = $1
      WHERE id = $2
    `, [organization.id, userId]);

    logger.info('Created personal organization', { userId, orgId: organization.id, slug });
    return organization;
  } catch (error) {
    logger.error('Failed to create personal organization', { userId, error: error.message });
    throw error;
  }
};

module.exports = { createPersonalOrganization, organizationColumns };
