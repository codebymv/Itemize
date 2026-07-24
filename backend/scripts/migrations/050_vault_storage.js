exports.up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS vaults (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL DEFAULT 'Untitled Vault',
                category VARCHAR(255) NOT NULL DEFAULT 'General',
                color_value VARCHAR(50) NOT NULL DEFAULT '#3B82F6',
                position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
                position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
                width INTEGER NOT NULL DEFAULT 400,
                height INTEGER NOT NULL DEFAULT 300,
                z_index INTEGER NOT NULL DEFAULT 0,
                is_locked BOOLEAN NOT NULL DEFAULT FALSE,
                encryption_salt VARCHAR(255),
                master_password_hash VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                share_token VARCHAR(255) UNIQUE,
                is_public BOOLEAN NOT NULL DEFAULT FALSE,
                shared_at TIMESTAMP WITH TIME ZONE
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS vault_items (
                id SERIAL PRIMARY KEY,
                vault_id INTEGER NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
                item_type VARCHAR(50) NOT NULL
                    CHECK (item_type IN ('key_value', 'secure_note')),
                label VARCHAR(255) NOT NULL,
                encrypted_value TEXT NOT NULL,
                iv VARCHAR(255) NOT NULL,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON vaults(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_share_token
                ON vaults(share_token) WHERE share_token IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_is_public
                ON vaults(is_public) WHERE is_public = TRUE
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vault_items_vault_id
                ON vault_items(vault_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vault_items_order
                ON vault_items(vault_id, order_index)
        `);
        await client.query(`
            CREATE OR REPLACE FUNCTION update_vault_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_vault_updated_at ON vaults
        `);
        await client.query(`
            CREATE TRIGGER trigger_vault_updated_at
                BEFORE UPDATE ON vaults
                FOR EACH ROW EXECUTE FUNCTION update_vault_updated_at()
        `);
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_vault_item_updated_at ON vault_items
        `);
        await client.query(`
            CREATE TRIGGER trigger_vault_item_updated_at
                BEFORE UPDATE ON vault_items
                FOR EACH ROW EXECUTE FUNCTION update_vault_updated_at()
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
        await client.query('DROP TABLE IF EXISTS vault_items');
        await client.query('DROP TABLE IF EXISTS vaults');
        await client.query('DROP FUNCTION IF EXISTS update_vault_updated_at()');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
