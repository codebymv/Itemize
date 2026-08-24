exports.up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            ALTER TABLE vaults
                ADD COLUMN IF NOT EXISTS crypto_version INTEGER NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS kdf_algorithm VARCHAR(32),
                ADD COLUMN IF NOT EXISTS kdf_memory_kib INTEGER,
                ADD COLUMN IF NOT EXISTS kdf_iterations INTEGER,
                ADD COLUMN IF NOT EXISTS kdf_parallelism INTEGER,
                ADD COLUMN IF NOT EXISTS wrapped_vek TEXT,
                ADD COLUMN IF NOT EXISTS wrapped_vek_recovery TEXT,
                ADD COLUMN IF NOT EXISTS share_token_hash VARCHAR(64),
                ADD COLUMN IF NOT EXISTS share_snapshot_ciphertext TEXT,
                ADD COLUMN IF NOT EXISTS share_snapshot_iv VARCHAR(255)
        `);
        await client.query(`
            ALTER TABLE vaults
                DROP CONSTRAINT IF EXISTS vaults_crypto_version_check
        `);
        await client.query(`
            ALTER TABLE vaults
                ADD CONSTRAINT vaults_crypto_version_check
                CHECK (crypto_version IN (1, 2))
        `);
        await client.query(`
            ALTER TABLE vault_items
                ADD COLUMN IF NOT EXISTS crypto_version INTEGER NOT NULL DEFAULT 1
        `);
        await client.query(`
            ALTER TABLE vault_items
                DROP CONSTRAINT IF EXISTS vault_items_crypto_version_check
        `);
        await client.query(`
            ALTER TABLE vault_items
                ADD CONSTRAINT vault_items_crypto_version_check
                CHECK (crypto_version IN (1, 2))
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vaults_share_token_hash
                ON vaults(share_token_hash)
                WHERE share_token_hash IS NOT NULL
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
            DROP INDEX IF EXISTS idx_vaults_share_token_hash
        `);
        await client.query(`
            ALTER TABLE vault_items
                DROP CONSTRAINT IF EXISTS vault_items_crypto_version_check
        `);
        await client.query(`
            ALTER TABLE vault_items
                DROP COLUMN IF EXISTS crypto_version
        `);
        await client.query(`
            ALTER TABLE vaults
                DROP CONSTRAINT IF EXISTS vaults_crypto_version_check
        `);
        await client.query(`
            ALTER TABLE vaults
                DROP COLUMN IF EXISTS crypto_version,
                DROP COLUMN IF EXISTS kdf_algorithm,
                DROP COLUMN IF EXISTS kdf_memory_kib,
                DROP COLUMN IF EXISTS kdf_iterations,
                DROP COLUMN IF EXISTS kdf_parallelism,
                DROP COLUMN IF EXISTS wrapped_vek,
                DROP COLUMN IF EXISTS wrapped_vek_recovery,
                DROP COLUMN IF EXISTS share_token_hash,
                DROP COLUMN IF EXISTS share_snapshot_ciphertext,
                DROP COLUMN IF EXISTS share_snapshot_iv
        `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
