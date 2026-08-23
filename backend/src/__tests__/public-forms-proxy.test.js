const express = require('express');
const request = require('supertest');
const {
    createPublicFormsProxy,
    publicFormsEnabled,
} = require('../public-forms-proxy');

const enabledEnvironment = {
    PUBLIC_FORMS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'read', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json());
    const proxy = createPublicFormsProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'read') app.get('/api/forms/public/form/:identifier', proxy, fallback);
    if (action === 'submit') app.post('/api/forms/public/form/:identifier', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('public forms proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(publicFormsEnabled({ PUBLIC_FORMS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicFormsEnabled({})).toBe(false);
        const response = await request(appFor()).get('/api/forms/public/form/frm_abc');
        expect(response.status).toBe(418);
    });

    test('forwards form reads without credentials', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/forms/public/form/frm_abc')
            .set('Cookie', 'itemize_auth=secret');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/forms/public/form/frm_abc');
        expect(options.headers.get('cookie')).toBeNull();
    });

    test('forwards the submission body with referer evidence', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }, 201));
        const response = await request(appFor({ action: 'submit', environment: enabledEnvironment, fetchImpl }))
            .post('/api/forms/public/form/frm_abc')
            .set('referer', 'https://embed.example.com')
            .send({ data: { 1: 'value' } });
        expect(response.status).toBe(201);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/forms/public/form/frm_abc');
        expect(options.method).toBe('POST');
        expect(options.headers.get('referer')).toBe('https://embed.example.com');
        expect(JSON.parse(options.body)).toEqual({ data: { 1: 'value' } });
    });

    test('passes upstream validation errors through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            success: false,
            error: {
                message: 'Email is required',
                code: 'REQUIRED_FIELD',
                details: { field_id: '2' },
            },
        }, 400));
        const response = await request(appFor({ action: 'submit', environment: enabledEnvironment, fetchImpl }))
            .post('/api/forms/public/form/frm_abc')
            .send({ data: {} });
        expect(response.status).toBe(400);
        expect(response.body.error.details).toEqual({ field_id: '2' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { PUBLIC_FORMS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get('/api/forms/public/form/frm_abc');
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).get('/api/forms/public/form/frm_abc');
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
