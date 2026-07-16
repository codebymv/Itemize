const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const { createPublicUploadsRouter } = require('../../lib/publicUploads');

describe('public upload exposure', () => {
    let root;
    let app;

    beforeAll(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'itemize-public-uploads-'));
        await fs.promises.mkdir(path.join(root, 'logos'), { recursive: true });
        await fs.promises.mkdir(path.join(root, 'signatures'), { recursive: true });
        await fs.promises.writeFile(path.join(root, 'logos', 'brand.png'), Buffer.from('public logo'));
        await fs.promises.writeFile(path.join(root, 'signatures', 'contract.pdf'), Buffer.from('%PDF-private'));

        app = express();
        app.use('/uploads', createPublicUploadsRouter(root));
        app.use((_req, res) => res.sendStatus(404));
    });

    afterAll(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    it('serves only the dedicated logo subtree with nosniff headers', async () => {
        const response = await request(app).get('/uploads/logos/brand.png');
        expect(response.status).toBe(200);
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('does not expose signature files through the static upload mount', async () => {
        const response = await request(app).get('/uploads/signatures/contract.pdf');
        expect(response.status).toBe(404);
        expect(response.text).not.toContain('%PDF-private');
    });
});
