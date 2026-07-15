const {
    allocateEstimateNumber,
    allocateInvoiceNumber,
} = require('../../services/invoice-number.service');

describe('invoice and estimate number allocation', () => {
    test('reserves an invoice number with one atomic upsert', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({
                rows: [{ invoice_prefix: 'BILL-', allocated_number: 42 }],
            }),
        };

        await expect(allocateInvoiceNumber(client, 7)).resolves.toBe('BILL-00042');

        expect(client.query).toHaveBeenCalledTimes(1);
        const [sql, params] = client.query.mock.calls[0];
        expect(sql).toContain('INSERT INTO payment_settings');
        expect(sql).toContain('ON CONFLICT (organization_id) DO UPDATE');
        expect(sql).toContain('next_invoice_number - 1 AS allocated_number');
        expect(params).toEqual([7]);
    });

    test('rejects an invalid allocation instead of emitting a duplicate-looking number', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({
                rows: [{ invoice_prefix: 'INV-', allocated_number: 0 }],
            }),
        };

        await expect(allocateInvoiceNumber(client, 7))
            .rejects.toThrow('Invoice number allocation returned an invalid number');
    });

    test('serializes the estimate MAX+1 calculation per organization', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ next_num: 13 }] }),
        };

        await expect(allocateEstimateNumber(client, 9)).resolves.toBe('EST-00013');

        expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
        expect(client.query.mock.calls[0][1]).toEqual([9]);
        expect(client.query.mock.calls[1][0]).toContain('FROM estimates');
        expect(client.query.mock.calls[1][1]).toEqual([9]);
    });
});
