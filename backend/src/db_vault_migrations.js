/**
 * Vault Migrations
 * Creates tables for encrypted vault storage
 */
const { logger } = require('./utils/logger');

/**
 * Run vault migrations
 * @param {Object} pool - PostgreSQL connection pool
 */
async function runVaultMigrations(pool) {
    const client = await pool.connect();
    try {
        logger.info('Running vault migrations...');

        // Create vaults table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vaults (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) DEFAULT 'Untitled Vault',
                category VARCHAR(255) DEFAULT 'General',
                color_value VARCHAR(50) DEFAULT '#3B82F6',
                position_x FLOAT NOT NULL DEFAULT 0,
                position_y FLOAT NOT NULL DEFAULT 0,
                width INTEGER DEFAULT 400,
                height INTEGER DEFAULT 300,
                z_index INTEGER DEFAULT 0,
                is_locked BOOLEAN DEFAULT FALSE,
                encryption_salt VARCHAR(255),
                master_password_hash VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                share_token VARCHAR(255) UNIQUE,
                is_public BOOLEAN DEFAULT FALSE,
                shared_at TIMESTAMP WITH TIME ZONE
            )
        `);
        logger.info('Vaults table created/verified');

        // Create vault_items table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vault_items (
                id SERIAL PRIMARY KEY,
                vault_id INTEGER NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
                item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('key_value', 'secure_note')),
                label VARCHAR(255) NOT NULL,
                encrypted_value TEXT NOT NULL,
                iv VARCHAR(255) NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('Vault items table created/verified');

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON vaults(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_share_token ON vaults(share_token) WHERE share_token IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_is_public ON vaults(is_public) WHERE is_public = TRUE
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vault_items_vault_id ON vault_items(vault_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vault_items_order ON vault_items(vault_id, order_index)
        `);
        logger.info('Vault indexes created/verified');

        // Create update trigger function if not exists
        await client.query(`
            CREATE OR REPLACE FUNCTION update_vault_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);

        // Create triggers
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_vault_updated_at ON vaults
        `);
        await client.query(`
            CREATE TRIGGER trigger_vault_updated_at
                BEFORE UPDATE ON vaults
                FOR EACH ROW
                EXECUTE FUNCTION update_vault_updated_at()
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS trigger_vault_item_updated_at ON vault_items
        `);
        await client.query(`
            CREATE TRIGGER trigger_vault_item_updated_at
                BEFORE UPDATE ON vault_items
                FOR EACH ROW
                EXECUTE FUNCTION update_vault_updated_at()
        `);
        logger.info('Vault triggers created/verified');

        logger.info('Vault migrations completed successfully');
    } catch (error) {
        logger.error('Error running vault migrations', { error: error.message });
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { runVaultMigrations };
