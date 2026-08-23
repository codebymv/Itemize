const express = require('express');
const request = require('supertest');
const {
    createPublicBookingsProxy,
    publicBookingsEnabled,
} = require('../public-bookings-proxy');

const enabledEnvironment = {
    PUBLIC_BOOKINGS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'page', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json());
    const proxy = createPublicBookingsProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'page') app.get('/api/bookings/public/book/:slug', proxy, fallback);
    if (action === 'slots') app.get('/api/bookings/public/book/:slug/slots', proxy, fallback);
    if (action === 'create') app.post('/api/bookings/public/book/:slug', proxy, fallback);
    if (action === 'cancel') app.post('/api/bookings/public/book/:slug/cancel/:token', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('public bookings proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(publicBookingsEnabled({ PUBLIC_BOOKINGS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicBookingsEnabled({})).toBe(false);
        const response = await request(appFor()).get('/api/bookings/public/book/cal_abc');
        expect(response.status).toBe(418);
    });

    test('rejects unknown proxy actions at creation', () => {
        expect(() => createPublicBookingsProxy({ action: 'reschedule' }))
            .toThrow('Public bookings proxy target is not allowed');
    });

    test('forwards page reads without credentials', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ id: 5 }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/bookings/public/book/cal_abc')
            .set('Cookie', 'itemize_auth=secret');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/bookings/public/book/cal_abc');
        expect(options.method).toBe('GET');
        expect(options.headers.get('cookie')).toBeNull();
        expect(response.body).toEqual({ id: 5 });
    });

    test('forwards only the recognized slot query parameters', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ slots: [] }));
        await request(appFor({ action: 'slots', environment: enabledEnvironment, fetchImpl }))
            .get('/api/bookings/public/book/cal_abc/slots?start_date=2026-09-01&end_date=2026-09-07&admin=true');
        const [url] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/bookings/public/book/cal_abc/slots?start_date=2026-09-01&end_date=2026-09-07',
        );
    });

    test('forwards the booking JSON body on create', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }, 201));
        const body = {
            start_time: '2026-09-01T13:00:00.000Z',
            attendee_name: 'Sam',
            attendee_email: 'sam@example.com',
        };
        const response = await request(appFor({ action: 'create', environment: enabledEnvironment, fetchImpl }))
            .post('/api/bookings/public/book/cal_abc')
            .send(body);
        expect(response.status).toBe(201);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/bookings/public/book/cal_abc');
        expect(options.method).toBe('POST');
        expect(options.headers.get('content-type')).toBe('application/json');
        expect(JSON.parse(options.body)).toEqual(body);
    });

    test('forwards the cancellation body and validates the token first', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
        const token = 'ab'.repeat(32);
        await request(appFor({ action: 'cancel', environment: enabledEnvironment, fetchImpl }))
            .post(`/api/bookings/public/book/cal_abc/cancel/${token}`)
            .send({ reason: 'Changed plans' });
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            `https://graphql.internal/api/bookings/public/book/cal_abc/cancel/${token}`,
        );
        expect(JSON.parse(options.body)).toEqual({ reason: 'Changed plans' });

        const malformed = await request(appFor({ action: 'cancel', environment: enabledEnvironment, fetchImpl }))
            .post('/api/bookings/public/book/cal_abc/cancel/not-a-token')
            .send({});
        expect(malformed.status).toBe(404);
        expect(malformed.body).toEqual({ error: 'Booking not found or already cancelled' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('passes upstream error statuses and bodies through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            error: 'This time slot is no longer available',
            reason: 'booking_conflict',
        }, 409));
        const response = await request(appFor({ action: 'create', environment: enabledEnvironment, fetchImpl }))
            .post('/api/bookings/public/book/cal_abc')
            .send({ start_time: 'x' });
        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'This time slot is no longer available',
            reason: 'booking_conflict',
        });
    });

    test('serves 503 when enabled without an upstream URL', async () => {
        const response = await request(appFor({
            environment: { PUBLIC_BOOKINGS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get('/api/bookings/public/book/cal_abc');
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('maps upstream failures to 502 without leaking the failure', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('socket hang up'));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/bookings/public/book/cal_abc');
        expect(response.status).toBe(502);
        expect(JSON.stringify(response.body)).not.toContain('socket hang up');
    });
});
