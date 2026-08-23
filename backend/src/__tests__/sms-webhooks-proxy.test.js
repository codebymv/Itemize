const express = require('express');
const request = require('supertest');
const {
    createSmsWebhookProxy,
    smsWebhooksEnabled,
} = require('../sms-webhooks-proxy');

const enabledEnvironment = {
    SMS_WEBHOOKS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'status', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.urlencoded({
        extended: true,
        verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
    }));
    app.post(
        `/api/sms-templates/webhook/${action}`,
        createSmsWebhookProxy({ action, environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).send('fallback'),
    );
    return app;
};

const textResponse = (body, status = 200, contentType = 'text/html; charset=utf-8') =>
    new Response(body, { status, headers: { 'content-type': contentType } });

describe('sms webhook proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(smsWebhooksEnabled({ SMS_WEBHOOKS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(smsWebhooksEnabled({})).toBe(false);
        const response = await request(appFor())
            .post('/api/sms-templates/webhook/status')
            .type('form')
            .send({ MessageSid: 'SM1' });
        expect(response.status).toBe(418);
    });

    test('rejects unknown proxy actions at creation', () => {
        expect(() => createSmsWebhookProxy({ action: 'voice' }))
            .toThrow('SMS webhook proxy target is not allowed');
    });

    test('forwards raw form bytes, the Twilio signature, and the public URL evidence', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(textResponse('OK'));
        const rawForm = 'MessageSid=SM1&MessageStatus=delivered&ErrorCode=';
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/sms-templates/webhook/status')
            .set('Content-Type', 'application/x-www-form-urlencoded')
            .set('X-Twilio-Signature', 'sig-abc')
            .set('Host', 'app.itemize.cloud')
            .send(rawForm);
        expect(response.status).toBe(200);
        expect(response.text).toBe('OK');
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/sms-templates/webhook/status');
        expect(options.body.toString('utf8')).toBe(rawForm);
        expect(options.headers.get('x-twilio-signature')).toBe('sig-abc');
        expect(options.headers.get('x-forwarded-host')).toBe('app.itemize.cloud');
        expect(options.headers.get('x-forwarded-proto')).toBe('http');
        expect(options.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    });

    test('passes upstream TwiML responses through unchanged', async () => {
        const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
        const fetchImpl = jest.fn().mockResolvedValue(textResponse(twiml, 200, 'text/xml; charset=utf-8'));
        const response = await request(appFor({ action: 'inbound', environment: enabledEnvironment, fetchImpl }))
            .post('/api/sms-templates/webhook/inbound')
            .type('form')
            .send({ MessageSid: 'SM2', From: '+1', To: '+2', Body: 'x' });
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/xml');
        expect(response.text).toBe(twiml);
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { SMS_WEBHOOKS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).post('/api/sms-templates/webhook/status').type('form').send({});
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).post('/api/sms-templates/webhook/status').type('form').send({});
        expect(failing.status).toBe(502);
        expect(failing.text).toBe('Error');
    });
});
