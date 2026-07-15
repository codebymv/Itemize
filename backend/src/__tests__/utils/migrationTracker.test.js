describe('migration tracker', () => {
    function loadTracker() {
        jest.resetModules();
        return require('../../utils/migrationTracker');
    }

    test('does not record a grouped migration that reports failures', async () => {
        const queries = [];
        const pool = {
            query: jest.fn(async (sql, params) => {
                queries.push({ sql, params });
                if (sql.includes('SELECT 1 FROM _migrations')) return { rows: [] };
                return { rows: [] };
            }),
        };
        const { runMigrationOnce } = loadTracker();

        await expect(runMigrationOnce(pool, 'broken_group', async () => ({ failed: 2 })))
            .resolves.toBe(false);
        expect(queries.some(query => query.sql.includes('INSERT INTO _migrations'))).toBe(false);
    });

    test('records a grouped migration with no reported failures', async () => {
        const pool = {
            query: jest.fn(async sql => {
                if (sql.includes('SELECT 1 FROM _migrations')) return { rows: [] };
                return { rows: [] };
            }),
        };
        const { runMigrationOnce } = loadTracker();

        await expect(runMigrationOnce(pool, 'healthy_group', async () => ({ failed: 0 })))
            .resolves.toBe(true);
        expect(pool.query).toHaveBeenCalledWith(
            'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            ['healthy_group']
        );
    });
});
