const express = require('express');
const request = require('supertest');

jest.mock('../../services/stripe.service', () => {
    return jest.fn().mockImplementation(() => ({
        getBillingStatus: jest.fn(async (organizationId) => ({ organization_id: organizationId, plan: 'starter' })),
        createCheckoutSession: jest.fn(async (organizationId) => `https://checkout.example/${organizationId}`),
        createPortalSession: jest.fn(async (organizationId) => `https://portal.example/${organizationId}`),
        handleWebhook: jest.fn(),
    }));
});

const billingRoutes = require('../../routes/billing.routes');
const StripeService = require('../../services/stripe.service');

function createPool() {
    const client = {
        query: jest.fn(async (sql, params) => {
            const text = String(sql);
            if (text.includes('default_organization_id')) {
                return { rows: [{ default_organization_id: 10, role: 'owner' }] };
            }
            if (text.includes('organization_members')) {
                const orgId = params[0];
                if (orgId === 99) return { rows: [] };
                return { rows: [{ role: 'owner' }] };
            }
            return { rows: [] };
        }),
        release: jest.fn(),
    };

    return {
        client,
        connect: jest.fn(async () => client),
        query: jest.fn(async (sql, params) => {
            const text = String(sql);
            if (text.includes('UPDATE organizations')) return { rows: [] };
            if (text.includes('FROM organizations')) {
                return {
                    rows: [{
                        emails_used: 2,
                        emails_limit: 10,
                        sms_used: 1,
                        sms_limit: 5,
                        api_calls_used: 3,
                        api_calls_limit: 100,
                        billing_period_start: null,
                        billing_period_end: null,
                    }],
                };
            }
            if (text.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
            return { rows: [] };
        }),
    };
}

function createApp(pool) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { id: 7, email: 'user@example.com' };
        next();
    });
    const authenticateJWT = (req, res, next) => next();
    app.use('/api/billing', billingRoutes(pool, authenticateJWT));
    return app;
}

describe('billing routes organization scope', () => {
    beforeEach(() => {
        StripeService.mockClear();
    });

    it('uses the user default organization when no organization header is provided', async () => {
        const pool = createPool();
        const res = await request(createApp(pool)).get('/api/billing');

        expect(res.status).toBe(200);
        expect(res.body.data.organization_id).toBe(10);
        const stripeInstance = StripeService.mock.results[0].value;
        expect(stripeInstance.getBillingStatus).toHaveBeenCalledWith(10);
    });

    it('rejects billing checkout for an organization the user does not belong to', async () => {
        const pool = createPool();
        const res = await request(createApp(pool))
            .post('/api/billing/checkout')
            .set('x-organization-id', '99')
            .send({
                planId: 'starter',
                billingPeriod: 'monthly',
                successUrl: 'https://app.example/success',
                cancelUrl: 'https://app.example/cancel',
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Not a member of this organization');
        const stripeInstance = StripeService.mock.results[0].value;
        expect(stripeInstance.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates checkout only for a permitted organization context', async () => {
        const pool = createPool();
        const res = await request(createApp(pool))
            .post('/api/billing/checkout')
            .set('x-organization-id', '10')
            .send({
                planId: 'starter',
                billingPeriod: 'monthly',
                successUrl: 'https://app.example/success',
                cancelUrl: 'https://app.example/cancel',
            });

        expect(res.status).toBe(200);
        expect(res.body.data.url).toBe('https://checkout.example/10');
        const stripeInstance = StripeService.mock.results[0].value;
        expect(stripeInstance.createCheckoutSession).toHaveBeenCalledWith(
            10,
            expect.any(String),
            'subscription',
            'https://app.example/success',
            'https://app.example/cancel'
        );
    });
});
