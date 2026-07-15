const { runRecurringInvoiceGeneration } = require('../../jobs/invoice-jobs');

describe('recurring invoice job claims', () => {
    test('skips a due template already claimed or advanced by another runner', async () => {
        const client = {
            release: jest.fn(),
            query: jest.fn(async sql => {
                if (sql.includes('FOR UPDATE OF r SKIP LOCKED')) return { rows: [] };
                if (sql.includes('SELECT r.id')) return { rows: [{ id: 12 }] };
                return { rows: [], rowCount: 1 };
            }),
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await expect(runRecurringInvoiceGeneration(pool)).resolves.toEqual([]);

        const claim = client.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE OF r SKIP LOCKED'));
        expect(claim[1]).toEqual([12]);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO invoices'))).toBe(false);
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
