const {
    expireStaleRealtimeEvents,
} = require('../../jobs/realtime-outbox-jobs');

describe('realtime outbox expiration policy', () => {
    test('expires only superseded projection updates after the configured age', async () => {
        const pool = {
            query: jest.fn().mockResolvedValue({ rowCount: 3, rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
        };

        await expect(expireStaleRealtimeEvents(pool, {
            maxEventAgeSeconds: 900,
        })).resolves.toBe(3);

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining("event_name IN ("),
            [900, null]
        );
        const statement = pool.query.mock.calls[0][0];
        expect(statement).toContain("status = 'expired'");
        expect(statement).toContain("LOWER(event_type) NOT LIKE '%deleted%'");
        expect(statement).toContain("LOWER(event_type) NOT LIKE '%revoked%'");
        expect(statement).not.toContain('newChatMessage');
        expect(statement).not.toContain('sharedContentRevoked');
    });

    test('can disable expiration without querying the database', async () => {
        const pool = { query: jest.fn() };

        await expect(expireStaleRealtimeEvents(pool, {
            maxEventAgeSeconds: 0,
        })).resolves.toBe(0);
        expect(pool.query).not.toHaveBeenCalled();
    });
});
