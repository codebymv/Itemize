const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { JWT_SECRET, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } = require('./config');
const { organizationColumns } = require('../routes/organization-columns');

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
};

const createPersonalOrganization = async (client, userId, userName) => {
  try {
    // Generate slug from name or email
    const slug = (userName || `user${userId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + `-${userId}`;

    // Create personal organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, slug, settings)
      VALUES ($1, $2, $3)
      RETURNING ${organizationColumns()}
    `, [`${userName}'s Workspace`, slug, JSON.stringify({ personal: true })]);

    const organization = orgResult.rows[0];

    // Add user as owner
    await client.query(`
      INSERT INTO organization_members (organization_id, user_id, role, joined_at)
      VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
    `, [organization.id, userId]);

    // Set as default organization
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

// ===========================

module.exports = {
  asyncHandler,
  generateTokens,
  createPersonalOrganization
};
