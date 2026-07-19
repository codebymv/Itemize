const TestDbHelper = require('./test-db-helper');
const {
    encryptCalendarToken,
    decryptCalendarToken,
    inspectCalendarTokenEnvelope,
} = require('../../utils/calendarTokenEncryption');
const {
    loadGoogleCalendarConnection,
} = require('../../services/calendarConnectionCredentials');
const {
    runCalendarTokenEncryptionMigration,
} = require('../../db_calendar_token_encryption_migrations');

describe('Calendar connection credential PostgreSQL contract', () => {
    let dbHelper;
    let identity;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        identity = await dbHelper.seedUser(
            `calendar-credentials-${Date.now()}@example.com`,
            'Calendar Credentials'
        );
    });

    afterAll(async () => {
        await dbHelper.teardown();
    });

    async function insertConnection(overrides = {}) {
        const result = await dbHelper.pool.query(`
            INSERT INTO calendar_connections (
              user_id, organization_id, provider, provider_account_id,
              provider_email, access_token, refresh_token, token_expires_at
            ) VALUES ($1, $2, 'google', $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            identity.user.id,
            identity.org.id,
            overrides.providerAccountId || `provider-${Date.now()}-${Math.random()}`,
            'calendar@example.com',
            encryptCalendarToken(overrides.accessToken || 'old-access', 'access'),
            encryptCalendarToken(overrides.refreshToken || 'refresh-secret', 'refresh'),
            overrides.tokenExpiresAt || new Date(Date.now() - 60_000),
        ]);
        return result.rows[0].id;
    }

    test('serializes concurrent refresh and persists only the winning encrypted token', async () => {
        const connectionId = await insertConnection();
        const refreshAccessToken = jest.fn(async token => {
            expect(token).toBe('refresh-secret');
            await new Promise(resolve => setTimeout(resolve, 50));
            return {
                access_token: 'fresh-access',
                refresh_token: 'rotated-refresh',
                expiry_date: Date.now() + 60 * 60 * 1000,
            };
        });
        const scope = {
            connectionId,
            userId: identity.user.id,
            organizationId: identity.org.id,
            requireActive: true,
        };
        const dependencies = {
            refreshAccessToken,
            needsTokenRefresh: expiresAt => new Date(expiresAt).getTime() <= Date.now(),
        };

        const [first, second] = await Promise.all([
            loadGoogleCalendarConnection(dbHelper.pool, scope, dependencies),
            loadGoogleCalendarConnection(dbHelper.pool, scope, dependencies),
        ]);

        expect(refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(first.access_token).toBe('fresh-access');
        expect(second.access_token).toBe('fresh-access');
        expect(first.refresh_token).toBe('rotated-refresh');
        expect(second.refresh_token).toBe('rotated-refresh');

        const stored = await dbHelper.pool.query(`
            SELECT access_token, refresh_token, token_generation
            FROM calendar_connections
            WHERE id = $1
        `, [connectionId]);
        expect(inspectCalendarTokenEnvelope(stored.rows[0].access_token)).not.toBeNull();
        expect(inspectCalendarTokenEnvelope(stored.rows[0].refresh_token)).not.toBeNull();
        expect(stored.rows[0].access_token).not.toContain('fresh-access');
        expect(decryptCalendarToken(stored.rows[0].access_token, 'access')).toBe('fresh-access');
        expect(decryptCalendarToken(stored.rows[0].refresh_token, 'refresh')).toBe('rotated-refresh');
        expect(Number(stored.rows[0].token_generation)).toBe(1);
    });

    test('repairs legacy plaintext once and enforces encrypted storage', async () => {
        await dbHelper.pool.query(`
            ALTER TABLE calendar_connections
              DROP CONSTRAINT calendar_connections_access_token_encrypted,
              DROP CONSTRAINT calendar_connections_refresh_token_encrypted
        `);
        const raw = await dbHelper.pool.query(`
            INSERT INTO calendar_connections (
              user_id, organization_id, provider, provider_account_id,
              access_token, refresh_token, token_expires_at
            ) VALUES ($1, $2, 'google', $3, 'legacy-access', 'legacy-refresh', NOW() + INTERVAL '1 hour')
            RETURNING id
        `, [identity.user.id, identity.org.id, `legacy-${Date.now()}`]);

        await runCalendarTokenEncryptionMigration(dbHelper.pool);
        const first = await dbHelper.pool.query(`
            SELECT access_token, refresh_token, token_generation
            FROM calendar_connections
            WHERE id = $1
        `, [raw.rows[0].id]);
        await runCalendarTokenEncryptionMigration(dbHelper.pool);
        const second = await dbHelper.pool.query(`
            SELECT access_token, refresh_token, token_generation
            FROM calendar_connections
            WHERE id = $1
        `, [raw.rows[0].id]);

        expect(decryptCalendarToken(first.rows[0].access_token, 'access')).toBe('legacy-access');
        expect(decryptCalendarToken(first.rows[0].refresh_token, 'refresh')).toBe('legacy-refresh');
        expect(second.rows[0]).toEqual(first.rows[0]);
        await expect(dbHelper.pool.query(`
            UPDATE calendar_connections SET access_token = 'plaintext' WHERE id = $1
        `, [raw.rows[0].id])).rejects.toMatchObject({ code: '23514' });
    });
});
