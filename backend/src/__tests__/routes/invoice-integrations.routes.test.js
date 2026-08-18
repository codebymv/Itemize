const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (req, _res, next) => {
        req.organizationId = 17;
        next();
    },
}));

jest.mock('../../services/stripeConnectService', () => ({
    getAuthUrl: jest.fn(state => `https://connect.stripe.com/oauth/authorize?state=${encodeURIComponent(state)}`),
    exchangeCodeForAccount: jest.fn(),
    deauthorizeAccount: jest.fn(),
}));
const stripeConnectService = require('../../services/stripeConnectService');
const {
    createStripeConnectState,
    verifyStripeConnectState,
    DEFAULT_RETURN_PATH,
} = require('../../services/stripeConnectState');
const createInvoiceIntegrationRoutes = require('../../routes/invoice-integrations.routes');

function createApp(pool) {
    const app = express();
    const authenticate = (req, _res, next) => {
        req.user = { id: 42 };
        next();
    };
    app.use('/api/invoice-integrations', createInvoiceIntegrationRoutes(pool, authenticate));
    return app;
}

describe('Stripe Connect route contract', () => {
    const pool = { connect: jest.fn() };
    const app = createApp(pool);
    const originalFrontend = process.env.FRONTEND_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        pool.connect.mockReset();
        process.env.FRONTEND_URL = 'https://app.itemize.test';
    });

    afterAll(() => {
        process.env.FRONTEND_URL = originalFrontend;
    });

    it('starts OAuth with signed tenant/user state and a safe return path', async () => {
        const response = await request(app)
            .get('/api/invoice-integrations/stripe/connect?return_url=https://evil.example/capture');

        expect(response.status).toBe(200);
        const state = stripeConnectService.getAuthUrl.mock.calls[0][0];
        expect(verifyStripeConnectState(state)).toMatchObject({
            userId: 42,
            organizationId: 17,
            returnPath: DEFAULT_RETURN_PATH,
        });
    });

    it('rejects unsigned callback state before any provider call', async () => {
        const state = JSON.stringify({ userId: 999, organizationId: 999, returnUrl: '//evil.example' });
        const response = await request(app)
            .get(`/api/invoice-integrations/stripe/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=invalid_state');
        expect(stripeConnectService.exchangeCodeForAccount).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects signed state when organization membership was removed during OAuth', async () => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
        pool.connect.mockResolvedValue(client);
        const state = createStripeConnectState({
            userId: 42,
            organizationId: 17,
            returnUrl: '/payment-settings',
        });
        const response = await request(app)
            .get(`/api/invoice-integrations/stripe/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=invalid_state');
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [42, 17]);
        expect(stripeConnectService.exchangeCodeForAccount).not.toHaveBeenCalled();
    });

    it('persists the connected account on the organization payment settings row', async () => {
        const membershipClient = {
            query: jest.fn().mockResolvedValue({ rows: [{ member: true }] }),
            release: jest.fn(),
        };
        const storageClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        pool.connect
            .mockResolvedValueOnce(membershipClient)
            .mockResolvedValueOnce(storageClient);
        stripeConnectService.exchangeCodeForAccount.mockResolvedValue({
            stripeAccountId: 'acct_connected',
            stripePublishableKey: 'pk_test_connected',
        });
        const state = createStripeConnectState({
            userId: 42,
            organizationId: 17,
            returnUrl: '/calendar-integrations',
        });

        const response = await request(app)
            .get(`/api/invoice-integrations/stripe/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'https://app.itemize.test/calendar-integrations?stripe_connected=true',
        );
        expect(storageClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO payment_settings'),
            [17, 'acct_connected', 'pk_test_connected'],
        );
    });

    it('clears stored Stripe fields on disconnect', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_connected' }] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(client);

        const response = await request(app).post('/api/invoice-integrations/stripe/disconnect');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(client.query.mock.calls[1][0]).toContain('stripe_connected = FALSE');
        expect(stripeConnectService.deauthorizeAccount).toHaveBeenCalledWith('acct_connected');
    });
});
