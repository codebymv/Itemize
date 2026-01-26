/**
 * Migration Tracker Utility
 * 
 * Tracks which migrations have already run to avoid re-running them on every startup.
 * This dramatically speeds up server startup after the first run.
 */

const { logger } = require('./logger');

// Track if the migrations table itself has been created this session
let migrationsTableCreated = false;

/**
 * Ensure the _migrations tracking table exists
 */
const ensureMigrationsTable = async (pool) => {
  if (migrationsTableCreated) return true;
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    migrationsTableCreated = true;
    return true;
  } catch (error) {
    logger.error('Failed to create _migrations table', { error: error.message });
    return false;
  }
};

/**
 * Check if a migration has already been executed
 */
const hasMigrationRun = async (pool, migrationName) => {
  try {
    const result = await pool.query(
      'SELECT 1 FROM _migrations WHERE name = $1',
      [migrationName]
    );
    return result.rows.length > 0;
  } catch (error) {
    // Table might not exist yet, return false to run migration
    return false;
  }
};

/**
 * Record that a migration has been executed
 */
const recordMigration = async (pool, migrationName) => {
  try {
    await pool.query(
      'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [migrationName]
    );
    return true;
  } catch (error) {
    logger.error('Failed to record migration', { name: migrationName, error: error.message });
    return false;
  }
};

/**
 * Run a migration only if it hasn't been executed before
 * 
 * @param {Pool} pool - Database connection pool
 * @param {string} migrationName - Unique name for this migration
 * @param {Function} migrationFn - The migration function to execute
 * @returns {Promise<boolean>} - True if migration ran or was already complete
 */
const runMigrationOnce = async (pool, migrationName, migrationFn) => {
  // Ensure tracking table exists
  await ensureMigrationsTable(pool);
  
  // Check if already run
  if (await hasMigrationRun(pool, migrationName)) {
    // Silent skip - don't log every skipped migration
    return true;
  }
  
  // Run the migration
  logger.info(`Running migration: ${migrationName}`);
  console.log(`Running migration: ${migrationName}...`);
  
  try {
    const result = await migrationFn(pool);
    
    if (result !== false) {
      // Record successful migration
      await recordMigration(pool, migrationName);
      logger.info(`✅ Migration completed: ${migrationName}`);
      console.log(`✅ Migration completed: ${migrationName}`);
    }
    
    return result !== false;
  } catch (error) {
    logger.error(`❌ Migration failed: ${migrationName}`, { error: error.message });
    console.error(`❌ Migration failed: ${migrationName}:`, error.message);
    return false;
  }
};

/**
 * Run multiple migrations in sequence, tracking each one
 * 
 * @param {Pool} pool - Database connection pool
 * @param {Array<{name: string, fn: Function}>} migrations - Array of migration objects
 * @returns {Promise<{success: number, skipped: number, failed: number}>}
 */
const runMigrationsOnce = async (pool, migrations) => {
  await ensureMigrationsTable(pool);
  
  const stats = { success: 0, skipped: 0, failed: 0 };
  
  for (const { name, fn } of migrations) {
    if (await hasMigrationRun(pool, name)) {
      stats.skipped++;
      continue;
    }
    
    const result = await runMigrationOnce(pool, name, fn);
    if (result) {
      stats.success++;
    } else {
      stats.failed++;
    }
  }
  
  return stats;
};

/**
 * Get list of all executed migrations
 */
const getExecutedMigrations = async (pool) => {
  try {
    await ensureMigrationsTable(pool);
    const result = await pool.query(
      'SELECT name, executed_at FROM _migrations ORDER BY executed_at'
    );
    return result.rows;
  } catch (error) {
    return [];
  }
};

/**
 * Reset a specific migration (for development/debugging)
 */
const resetMigration = async (pool, migrationName) => {
  try {
    await pool.query('DELETE FROM _migrations WHERE name = $1', [migrationName]);
    logger.info(`Reset migration: ${migrationName}`);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  ensureMigrationsTable,
  hasMigrationRun,
  recordMigration,
  runMigrationOnce,
  runMigrationsOnce,
  getExecutedMigrations,
  resetMigration
};
