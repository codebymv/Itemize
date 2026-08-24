const VERSION_FOREIGN_KEY = 'pages_current_version_id_fkey';

exports.up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS page_versions (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL,
                content JSONB NOT NULL,
                description TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                published_at TIMESTAMP WITH TIME ZONE,
                is_current BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(page_id, version_number)
            )
        `);
        await client.query(`
            ALTER TABLE page_versions
                ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE,
                ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);
        await client.query(`
            ALTER TABLE pages
                ADD COLUMN IF NOT EXISTS current_version_id INTEGER
        `);
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = '${VERSION_FOREIGN_KEY}'
                      AND conrelid = 'pages'::regclass
                ) THEN
                    ALTER TABLE pages
                        ADD CONSTRAINT ${VERSION_FOREIGN_KEY}
                        FOREIGN KEY (current_version_id)
                        REFERENCES page_versions(id)
                        ON DELETE SET NULL;
                END IF;
            END
            $$
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_page
                ON page_versions(page_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_version
                ON page_versions(page_id, version_number)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_versions_created
                ON page_versions(created_at)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pages_version
                ON pages(current_version_id)
                WHERE current_version_id IS NOT NULL
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
        await client.query('DROP INDEX IF EXISTS idx_pages_version');
        await client.query(
            `ALTER TABLE pages DROP CONSTRAINT IF EXISTS ${VERSION_FOREIGN_KEY}`,
        );
        await client.query(
            'ALTER TABLE pages DROP COLUMN IF EXISTS current_version_id',
        );
        await client.query('DROP TABLE IF EXISTS page_versions');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
