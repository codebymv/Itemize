const express = require('express');
const request = require('supertest');
const createOrganizationMiddleware = require('../../middleware/organization');

function createPool(queryHandler) {
    const client = {
        query: jest.fn(queryHandler),
        release: jest.fn(),
    };
    return {
        client,
        connect: jest.fn().mockResolvedValue(client),
    };
}

function createApp(pool, { authenticated = true, optional = false, roles = [] } = {}) {
    const { requireOrganization, optionalOrganization, requireRole } = createOrganizationMiddleware(pool);
    const app = express();
    app.use(express.json());
    if (authenticated) {
        app.use((req, _res, next) => {
            req.user = { id: 7 };
            next();
        });
    }
    const middleware = optional ? optionalOrganization : requireOrganization;
    app.get('/context', middleware, ...roles.map(role => requireRole(role)), (req, res) => {
        res.json({ organizationId: req.organizationId ?? null, role: req.orgRole ?? null });
    });
    return app;
}

describe('organization context middleware', () => {
    test('resolves an explicitly requested organization after membership verification', async () => {
        const pool = createPool(async () => ({ rows: [{ role: 'admin' }] }));

        const response = await request(createApp(pool))
            .get('/context')
            .set('x-organization-id', '42');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ organizationId: 42, role: 'admin' });
        expect(pool.client.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [42, 7]);
        expect(pool.client.release).toHaveBeenCalledTimes(1);
    });

    test('falls back to the current database-backed default membership', async () => {
        const pool = createPool(async () => ({
            rows: [{ default_organization_id: 91, role: 'owner' }],
        }));

        const response = await request(createApp(pool)).get('/context');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ organizationId: 91, role: 'owner' });
        expect(pool.client.query.mock.calls[0][1]).toEqual([7]);
    });

    test('rejects a requested organization when the user is not a member', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const response = await request(createApp(pool))
            .get('/context')
            .set('x-organization-id', '42');

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Not a member of this organization');
        expect(pool.client.release).toHaveBeenCalledTimes(1);
    });

    test('rejects malformed organization IDs before connecting to PostgreSQL', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const response = await request(createApp(pool))
            .get('/context')
            .set('x-organization-id', '42-not-an-id');

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('INVALID_ORGANIZATION_ID');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rejects missing authentication before connecting to PostgreSQL', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const response = await request(createApp(pool, { authenticated: false })).get('/context');

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('AUTH_REQUIRED');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('enforces the current membership role after resolving context', async () => {
        const pool = createPool(async () => ({ rows: [{ role: 'member' }] }));

        const response = await request(createApp(pool, { roles: ['owner'] }))
            .get('/context')
            .set('x-organization-id', '42');

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Required roles: owner');
    });

    test('optional context ignores malformed IDs without touching PostgreSQL', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const response = await request(createApp(pool, { optional: true }))
            .get('/context')
            .set('x-organization-id', '-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ organizationId: null, role: null });
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('releases the database client when membership lookup fails', async () => {
        const pool = createPool(async () => {
            throw new Error('database unavailable');
        });

        const response = await request(createApp(pool))
            .get('/context')
            .set('x-organization-id', '42');

        expect(response.status).toBe(500);
        expect(pool.client.release).toHaveBeenCalledTimes(1);
    });
});
