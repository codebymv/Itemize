const express = require('express');
const request = require('supertest');

const mockSendCampaignEmails = jest.fn().mockResolvedValue(undefined);
const mockIsWithinLimits = jest.fn().mockResolvedValue({
    withinLimits: true,
    current: 0,
    limit: 100,
    remaining: 100,
});
const mockIncrementUsage = jest.fn().mockResolvedValue({ count: 1 });

jest.mock('../../routes/campaigns/delivery', () => ({ sendCampaignEmails: mockSendCampaignEmails }));
jest.mock('../../services/usageTrackingService', () => jest.fn().mockImplementation(() => ({
    isWithinLimits: mockIsWithinLimits,
    incrementUsage: mockIncrementUsage,
})));

const createActionsRouter = require('../../routes/campaigns/actions.routes');

describe('campaign send transaction contract', () => {
    test('locks the campaign before transitioning it to sending', async () => {
        const campaign = {
            id: 12,
            organization_id: 7,
            status: 'draft',
            segment_type: 'all',
            tag_ids: [],
            excluded_tag_ids: [],
            subject: 'Launch',
        };
        const client = {
            query: jest.fn(async sql => {
                if (/SELECT[\s\S]+FROM email_campaigns c/.test(sql)) return { rows: [campaign] };
                if (/SELECT c\.id, c\.email/.test(sql)) {
                    return { rows: [{ id: 44, email: 'recipient@example.com', first_name: 'A', last_name: 'B' }] };
                }
                if (/SELECT[\s\S]+FROM email_campaigns WHERE id/.test(sql)) {
                    return { rows: [{ ...campaign, status: 'sending' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.user = { id: 3 };
            req.organizationId = 7;
            next();
        });
        const pass = (_req, _res, next) => next();
        app.use('/api/campaigns', createActionsRouter(pool, pass, pass));

        const response = await request(app).post('/api/campaigns/12/send').send({});

        expect(response.status).toBe(200);
        const campaignRead = client.query.mock.calls.find(([sql]) =>
            /FROM email_campaigns c/.test(sql)
        );
        expect(campaignRead[0]).toContain('FOR UPDATE OF c');
        expect(mockSendCampaignEmails).toHaveBeenCalledWith(
            pool,
            '12',
            expect.objectContaining({ status: 'sending' }),
            expect.any(Array)
        );
    });
});
