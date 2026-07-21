const express = require('express');
const request = require('supertest');
const { createInvoiceLogoUploadProxy } = require('../invoice-logo-upload-proxy');

const appFor = ({ environment = {}, fetchImpl = jest.fn(), targetPath = '/api/invoices/businesses/:id/logo' } = {}) => {
    const app = express();
    app.post('/api/invoices/businesses/:id/logo',
        createInvoiceLogoUploadProxy({ targetPath, environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(299).json({ source: 'legacy' }));
    return { app, fetchImpl };
};

describe('Invoice logo upload NestJS proxy', () => {
    it('falls through unless explicitly enabled', async () => {
        const { app, fetchImpl } = appFor();
        await request(app).post('/api/invoices/businesses/4/logo')
            .attach('logo', Buffer.from('legacy'), 'logo.png').expect(299);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('forwards exact multipart bytes and only authenticated upload headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { logo_url: '/uploads/logos/new.png' } }),
            { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'no=true' } },
        ));
        const { app } = appFor({
            environment: {
                INVOICE_LOGO_UPLOADS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            }, fetchImpl,
        });
        await request(app).post('/api/invoices/businesses/4/logo')
            .set('Cookie', ['itemize_auth=token', 'csrf-token=csrf'])
            .set('X-CSRF-Token', 'csrf').set('X-Organization-Id', '7')
            .attach('logo', Buffer.from('image-bytes'), 'logo.png').expect(200);
        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe('https://graphql.internal/api/invoices/businesses/4/logo');
        expect(options.headers.get('cookie')).toContain('itemize_auth=token');
        expect(options.headers.get('x-organization-id')).toBe('7');
        expect(options.headers.get('authorization')).toBeNull();
        expect(options.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
        expect(Buffer.isBuffer(options.body)).toBe(true);
    });

    it('fails closed for missing upstream, wrong media type, and oversized bodies', async () => {
        const missing = appFor({ environment: { INVOICE_LOGO_UPLOADS_NESTJS_ENABLED: 'true' } });
        await request(missing.app).post('/api/invoices/businesses/4/logo').expect(503);
        const configured = appFor({ environment: {
            INVOICE_LOGO_UPLOADS_NESTJS_ENABLED: 'true', GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
        } });
        await request(configured.app).post('/api/invoices/businesses/4/logo').send({ nope: true }).expect(400);
        await request(configured.app).post('/api/invoices/businesses/4/logo')
            .set('Content-Type', 'multipart/form-data; boundary=x')
            .set('Content-Length', String(3 * 1024 * 1024)).send('--x--').expect(413);
    });
});
