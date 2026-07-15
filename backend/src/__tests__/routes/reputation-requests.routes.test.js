const express = require('express');
const request = require('supertest');
const createRequestRoutes = require('../../routes/reputation/requests.routes');

const pass = (_req, _res, next) => next();

function createApp(rows) {
    const client = {
        query: jest.fn().mockResolvedValue({ rows }),
        release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.organizationId = 7;
        next();
    });
    app.use('/api/reputation', createRequestRoutes({ pool, authenticateJWT: pass, requireOrganization: pass }));
    return { app, client };
}

describe('reputation request deletion', () => {
    test('deletes only within the active organization', async () => {
        const { app, client } = createApp([{ id: 12 }]);

        const response = await request(app).delete('/api/reputation/requests/12');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: 12, deleted: true });
        expect(client.query.mock.calls[0][1]).toEqual(['12', 7]);
        expect(client.query.mock.calls[0][0]).toContain('organization_id = $2');
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('returns not found when the request is outside the organization', async () => {
        const { app } = createApp([]);

        const response = await request(app).delete('/api/reputation/requests/99');

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
    });
});
