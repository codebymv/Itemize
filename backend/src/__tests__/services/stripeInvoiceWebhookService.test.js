const {
    processStripeInvoiceWebhook,
} = require('../../services/stripeInvoiceWebhookService');

function event(overrides = {}) {
    return {
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_1',
                payment_intent: 'pi_1',
                payment_status: 'paid',
                amount_total: 5000,
                currency: 'usd',
                metadata: { invoice_id: '42', organization_id: '7' },
            },
        },
        ...overrides,
    };
}

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
};

describe('Stripe invoice webhook service', () => {
    test('does nothing when the Stripe event ID was already claimed', async () => {
        const client = {
            query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        };

        await expect(processStripeInvoiceWebhook(client, event(), logger)).resolves.toEqual({
            received: true,
            duplicateEvent: true,
            handled: false,
        });
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('records a paid checkout once using the invoice organization', async () => {
        const client = {
            query: jest.fn(async sql => {
                if (sql.includes('INSERT INTO stripe_webhook_events')) return { rowCount: 1, rows: [{ event_id: 'evt_checkout_1' }] };
                if (sql.includes('SELECT id FROM payments')) return { rows: [] };
                if (sql.includes('SELECT organization_id')) {
                    return { rows: [{ organization_id: 7, total: '50.00', amount_paid: '0.00' }] };
                }
                return { rows: [], rowCount: 1 };
            }),
        };

        const result = await processStripeInvoiceWebhook(client, event(), logger);
        expect(result).toEqual({
            received: true,
            duplicateEvent: false,
            handled: true,
            duplicatePayment: false,
        });

        const paymentCall = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO payments'));
        expect(paymentCall[1]).toEqual([7, '42', 50, 'USD', 'pi_1']);
        const invoiceUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE invoices SET'));
        expect(invoiceUpdate[1]).toEqual([50, 0, 'paid', '42']);
    });

    test('does not apply a second event for an existing payment reference', async () => {
        const client = {
            query: jest.fn(async sql => {
                if (sql.includes('INSERT INTO stripe_webhook_events')) return { rowCount: 1, rows: [{ event_id: 'evt_checkout_2' }] };
                if (sql.includes('SELECT id FROM payments')) return { rows: [{ id: 99 }] };
                return { rows: [] };
            }),
        };
        const secondEvent = event({ id: 'evt_checkout_2' });

        await expect(processStripeInvoiceWebhook(client, secondEvent, logger)).resolves.toMatchObject({
            duplicateEvent: false,
            handled: true,
            duplicatePayment: true,
        });
        expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE invoices SET'))).toBe(false);
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO payments'))).toBe(false);
    });

    test('requires a stable Stripe event identifier', async () => {
        const client = { query: jest.fn() };
        await expect(processStripeInvoiceWebhook(client, event({ id: undefined }), logger))
            .rejects.toThrow('must include id and type');
        expect(client.query).not.toHaveBeenCalled();
    });
});
