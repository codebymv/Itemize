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
jest.mock('../../services/calendarSyncJobs', () => ({
    enqueueCalendarSyncJob: jest.fn(),
    normalizeSelectedCalendars: jest.fn(value => value),
    publicCalendarSyncJob: jest.fn(job => ({
        id: Number(job.id),
        status: job.status,
    })),
}));

const googleCalendarService = require('../../services/googleCalendarService');
const { enqueueCalendarSyncJob } = require('../../services/calendarSyncJobs');
const { createCalendarOAuthState, verifyCalendarOAuthState } = require('../../services/calendarOAuthState');
const { decryptCalendarToken } = require('../../utils/calendarTokenEncryption');
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

    it('stores OAuth credentials only as authenticated encryption envelopes', async () => {
        const membershipClient = {
            query: jest.fn().mockResolvedValue({ rows: [{ member: true }] }),
            release: jest.fn(),
        };
        const storageClient = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn(),
        };
        pool.connect
            .mockResolvedValueOnce(membershipClient)
            .mockResolvedValueOnce(storageClient);
        googleCalendarService.exchangeCodeForTokens.mockResolvedValue({
            access_token: 'provider-access',
            refresh_token: 'provider-refresh',
            expiry_date: Date.now() + 60 * 60 * 1000,
        });
        googleCalendarService.getUserInfo.mockResolvedValue({
            id: 'provider-account',
            email: 'provider@example.com',
        });
        const state = createCalendarOAuthState({
            userId: 42,
            organizationId: 17,
            returnUrl: '/calendars',
        });

        const response = await request(app)
            .get(`/api/calendar-integrations/google/callback?code=provider-code&state=${encodeURIComponent(state)}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('google_connected=true');
        const insertCall = storageClient.query.mock.calls.find(([sql]) =>
            sql.includes('INSERT INTO calendar_connections')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1][4]).not.toContain('provider-access');
        expect(insertCall[1][5]).not.toContain('provider-refresh');
        expect(decryptCalendarToken(insertCall[1][4], 'access')).toBe('provider-access');
        expect(decryptCalendarToken(insertCall[1][5], 'refresh')).toBe('provider-refresh');
    });

    it('queues sync work with request idempotency instead of calling Google inline', async () => {
        enqueueCalendarSyncJob.mockResolvedValue({
            created: true,
            job: { id: '91', status: 'queued' },
        });

        const response = await request(app)
            .post('/api/calendar-integrations/sync/22')
            .set('Idempotency-Key', 'calendar-sync-request-1');

        expect(response.status).toBe(202);
        expect(response.body).toEqual({
            message: 'Sync queued',
            job: { id: 91, status: 'queued' },
        });
        expect(enqueueCalendarSyncJob).toHaveBeenCalledWith(pool, {
            connectionId: '22',
            userId: 42,
            organizationId: 17,
            idempotencyKey: 'calendar-sync-request-1',
        });
        expect(googleCalendarService.syncBookingsToGoogle).not.toHaveBeenCalled();
    });
});
