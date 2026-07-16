const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (req, _res, next) => {
        req.organizationId = 17;
        next();
    },
}));

jest.mock('../../services/googleCalendarService', () => ({
    getAuthUrl: jest.fn(state => `https://accounts.example/authorize?state=${encodeURIComponent(state)}`),
    exchangeCodeForTokens: jest.fn(),
    getUserInfo: jest.fn(),
    needsTokenRefresh: jest.fn(),
    refreshAccessToken: jest.fn(),
    listCalendars: jest.fn(),
    syncBookingsToGoogle: jest.fn(),
}));

const googleCalendarService = require('../../services/googleCalendarService');
const { createCalendarOAuthState, verifyCalendarOAuthState } = require('../../services/calendarOAuthState');
const createCalendarIntegrationRoutes = require('../../routes/calendar-integrations.routes');

function createApp(pool) {
    const app = express();
    const authenticate = (req, _res, next) => {
        req.user = { id: 42 };
        next();
    };
    app.use('/api/calendar-integrations', createCalendarIntegrationRoutes(pool, authenticate));
    return app;
}

describe('calendar integration OAuth route contract', () => {
    const pool = { connect: jest.fn() };
    const app = createApp(pool);

    beforeEach(() => {
        jest.clearAllMocks();
        pool.connect.mockReset();
    });

    it('starts OAuth with signed tenant/user state and a safe return path', async () => {
        const response = await request(app)
            .get('/api/calendar-integrations/google/auth?return_url=https://evil.example/capture');

        expect(response.status).toBe(200);
        const state = googleCalendarService.getAuthUrl.mock.calls[0][0];
        expect(verifyCalendarOAuthState(state)).toMatchObject({
            userId: 42,
            organizationId: 17,
            returnPath: '/calendars',
        });
    });

    it('rejects legacy unsigned callback state before any provider call', async () => {
        const state = JSON.stringify({ userId: 999, organizationId: 999, returnUrl: '//evil.example' });
        const response = await request(app)
            .get(`/api/calendar-integrations/google/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=invalid_state');
        expect(googleCalendarService.exchangeCodeForTokens).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects signed state when organization membership was removed during OAuth', async () => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
        pool.connect.mockResolvedValue(client);
        const state = createCalendarOAuthState({ userId: 42, organizationId: 17, returnUrl: '/calendars' });
        const response = await request(app)
            .get(`/api/calendar-integrations/google/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=invalid_state');
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [42, 17]);
        expect(client.release).toHaveBeenCalled();
        expect(googleCalendarService.exchangeCodeForTokens).not.toHaveBeenCalled();
    });
});
