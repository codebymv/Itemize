const express = require('express');
const request = require('supertest');

const createSmsRoutes = require('../../routes/sms-templates.routes');

function createApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    const noop = (_req, _res, next) => next();
    const pool = {
        connect: jest.fn(() => {
            throw new Error('database must not be reached when verification fails');
        }),
    };
    app.use('/api/sms-templates', createSmsRoutes(pool, noop, noop));
    return { app, pool };
}

describe('Twilio webhook production verification', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const originalBypass = process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;

    beforeEach(() => {
        process.env.NODE_ENV = 'production';
        delete process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;
    });

    afterAll(() => {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalAuthToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
        else process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
        if (originalBypass === undefined) delete process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;
        else process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = originalBypass;
    });

    test('fails closed when the auth token is absent', async () => {
        delete process.env.TWILIO_AUTH_TOKEN;
        const { app, pool } = createApp();

        const response = await request(app)
            .post('/api/sms-templates/webhook/status')
            .send({ MessageSid: 'SM1', MessageStatus: 'delivered' });

        expect(response.status).toBe(503);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rejects an unsigned callback when the auth token is configured', async () => {
        process.env.TWILIO_AUTH_TOKEN = 'test-token';
        const { app, pool } = createApp();

        const response = await request(app)
            .post('/api/sms-templates/webhook/inbound')
            .send({ MessageSid: 'IM1', From: '+16025550100', To: '+16025550101', Body: 'hello' });

        expect(response.status).toBe(403);
        expect(pool.connect).not.toHaveBeenCalled();
    });
});
