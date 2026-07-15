const {
    discoverExpectedMigrationMarkers,
    discoverExpectedTables,
} = require('../../../scripts/initialize-test-database');

describe('test database schema contract', () => {
    test('discovers the application migration tables used by integration tests', () => {
        const tables = discoverExpectedTables();
        expect(tables).toEqual(expect.arrayContaining([
            '_migrations',
            'bookings',
            'contacts',
            'invoices',
            'organization_members',
            'organizations',
            'payments',
            'users',
            'workflows',
        ]));
        expect(tables.length).toBeGreaterThan(70);
    });

    test('discovers every top-level initializer marker', () => {
        const markers = discoverExpectedMigrationMarkers();
        expect(markers).toEqual(expect.arrayContaining([
            'core_users_table',
            'module_crm',
            'module_invoicing',
            'module_subscriptions',
        ]));
        expect(markers.length).toBeGreaterThan(20);
    });

    test('production migration stream creates the Stripe event claim table', async () => {
        const migration = require('../../../scripts/migrations/006_stripe_webhook_idempotency');
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await migration.up(pool);
        expect(pool.query.mock.calls.some(([sql]) => sql.includes('CREATE TABLE IF NOT EXISTS stripe_webhook_events')))
            .toBe(true);
    });
});
