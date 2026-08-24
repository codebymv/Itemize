const { Pool } = require('pg');
const {
  getTestDatabasePoolConfig,
} = require('../../../db/test-support/test-database-config');

/**
 * Feature integration specs exercise their own product contract, not checkout.
 * Give organizations created without explicit billing fields an active Studio+
 * entitlement. Billing/auth specs supply explicit plan state and remain
 * authoritative for subscription and signup behavior.
 */
module.exports = async () => {
  const pool = new Pool(getTestDatabasePoolConfig(process.env));
  try {
    await pool.query(`
      ALTER TABLE organizations
        ALTER COLUMN plan SET DEFAULT 'pro',
        ALTER COLUMN subscription_status SET DEFAULT 'active'
    `);
  } finally {
    await pool.end();
  }
};
