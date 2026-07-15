const express = require('express');
const request = require('supertest');

process.env.GOOGLE_CLIENT_ID = 'itemize-test-client.apps.googleusercontent.com';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../db', () => ({
    userOperations: {
        findByEmail: jest.fn(),
        findOrCreate: jest.fn(),
    },
}));

const axios = require('axios');
const { userOperations } = require('../../db');
const createGoogleRoutes = require('../../auth/google.routes');

function createPool() {
    return {
        connect: jest.fn(),
        query: jest.fn(async sql => {
            if (String(sql).includes('default_organization_id')) {
                return { rows: [{ default_organization_id: 42 }] };
            }
            return { rows: [], rowCount: 1 };
        }),
    };
}

function createApp(pool = createPool()) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.dbPool = pool;
        next();
    });
    app.use('/api/auth', createGoogleRoutes());
    return { app, pool };
}

describe('Google authentication contract', () => {
    beforeEach(() => {
        userOperations.findByEmail.mockResolvedValue(null);
        userOperations.findOrCreate.mockResolvedValue({
            id: 7,
            email: 'verified@example.com',
            name: 'Verified User',
            role: 'USER',
        });
    });

    test('rejects the legacy client-supplied identity payload', async () => {
        const { app } = createApp();

        const response = await request(app).post('/api/auth/google-login').send({
            googleId: 'attacker-selected-id',
            email: 'victim@example.com',
            name: 'Victim',
        });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('GOOGLE_ACCESS_TOKEN_REQUIRED');
        expect(axios.get).not.toHaveBeenCalled();
        expect(userOperations.findOrCreate).not.toHaveBeenCalled();
    });

    test('rejects a Google token issued to a different OAuth client', async () => {
        axios.get.mockResolvedValueOnce({ data: { aud: 'other-client.apps.googleusercontent.com' } });
        const { app } = createApp();

        const response = await request(app).post('/api/auth/google-login').send({ accessToken: 'token' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_GOOGLE_TOKEN');
        expect(userOperations.findOrCreate).not.toHaveBeenCalled();
    });

    test('rejects an unverified Google email identity', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { aud: process.env.GOOGLE_CLIENT_ID } })
            .mockResolvedValueOnce({
                data: {
                    sub: 'google-user-7',
                    email: 'unverified@example.com',
                    email_verified: false,
                    name: 'Unverified User',
                },
            });
        const { app } = createApp();

        const response = await request(app).post('/api/auth/google-login').send({ accessToken: 'token' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_GOOGLE_IDENTITY');
        expect(userOperations.findOrCreate).not.toHaveBeenCalled();
    });

    test('derives identity from Google and returns only httpOnly session cookies', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { aud: process.env.GOOGLE_CLIENT_ID } })
            .mockResolvedValueOnce({
                data: {
                    sub: 'google-user-7',
                    email: 'Verified@Example.com',
                    email_verified: true,
                    name: 'Verified User',
                },
            });
        const { app, pool } = createApp();

        const response = await request(app).post('/api/auth/google-login').send({ accessToken: 'token' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            user: { uid: 7, email: 'verified@example.com', name: 'Verified User' },
        });
        expect(response.body.accessToken).toBeUndefined();
        expect(userOperations.findOrCreate).toHaveBeenCalledWith(pool, {
            email: 'verified@example.com',
            name: 'Verified User',
            googleId: 'google-user-7',
            provider: 'google',
        });
        const cookies = response.headers['set-cookie'].join(';').toLowerCase();
        expect(cookies).toContain('itemize_auth=');
        expect(cookies).toContain('itemize_refresh=');
        expect(cookies).toContain('httponly');
    });
});
