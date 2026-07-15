const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { router: authRouter } = require('../../auth');
const { csrfProtection, issueCsrfToken } = require('../../middleware/csrf');

function createPool(queryHandler) {
    const client = {
        query: jest.fn(queryHandler),
        release: jest.fn(),
    };

    return {
        client,
        connect: jest.fn(async () => client),
    };
}

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, res, next) => {
        req.dbPool = pool;
        next();
    });
    app.get('/api/auth/csrf', issueCsrfToken);
    app.use('/api', csrfProtection);
    app.use('/api/auth', authRouter);
    app.post('/api/protected-write', (req, res) => {
        res.json({ success: true });
    });
    return app;
}

describe('auth cookies and csrf integration', () => {
    it('logs in with httpOnly cookies and does not return tokens in the response body', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async () => ({
            rows: [{
                id: 7,
                email: 'user@example.com',
                name: 'Test User',
                password_hash: passwordHash,
                provider: 'email',
                email_verified: true,
                role: 'USER',
            }],
        }));

        const res = await request(createApp(pool))
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeUndefined();
        expect(res.body.refreshToken).toBeUndefined();
        expect(res.headers['set-cookie'].join(';')).toContain('itemize_auth=');
        expect(res.headers['set-cookie'].join(';')).toContain('itemize_refresh=');
        expect(res.headers['set-cookie'].join(';').toLowerCase()).toContain('httponly');
    });

    it('authenticates /me from the auth cookie only', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async (sql) => {
            if (String(sql).includes('password_hash')) {
                return {
                    rows: [{
                        id: 7,
                        email: 'user@example.com',
                        name: 'Test User',
                        password_hash: passwordHash,
                        provider: 'email',
                        email_verified: true,
                        role: 'USER',
                    }],
                };
            }

            return {
                rows: [{
                    id: 7,
                    email: 'user@example.com',
                    name: 'Test User',
                    provider: 'email',
                    email_verified: true,
                    role: 'USER',
                    created_at: '2026-01-01T00:00:00.000Z',
                }],
            };
        });

        const agent = request.agent(createApp(pool));
        await agent
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' })
            .expect(200);

        const res = await agent.get('/api/auth/me');

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('user@example.com');
    });

    it('rejects authenticated mutating requests without csrf and allows them with csrf', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async () => ({
            rows: [{
                id: 7,
                email: 'user@example.com',
                name: 'Test User',
                password_hash: passwordHash,
                provider: 'email',
                email_verified: true,
                role: 'USER',
            }],
        }));
        const agent = request.agent(createApp(pool));

        await agent
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' })
            .expect(200);

        await agent.post('/api/protected-write').send({ ok: true }).expect(403);

        const csrf = await agent.get('/api/auth/csrf').expect(200);

        await agent
            .post('/api/protected-write')
            .set('x-csrf-token', csrf.body.csrfToken)
            .send({ ok: true })
            .expect(200);
    });

    it('refreshes the access cookie using only the refresh cookie', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async (sql) => {
            if (String(sql).includes('password_hash')) {
                return {
                    rows: [{
                        id: 7,
                        email: 'user@example.com',
                        name: 'Test User',
                        password_hash: passwordHash,
                        provider: 'email',
                        email_verified: true,
                        role: 'USER',
                    }],
                };
            }

            return {
                rows: [{
                    id: 7,
                    email: 'user@example.com',
                    name: 'Test User',
                    email_verified: true,
                }],
            };
        });
        const agent = request.agent(createApp(pool));

        await agent
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' })
            .expect(200);

        const csrf = await agent.get('/api/auth/csrf').expect(200);
        const res = await agent
            .post('/api/auth/refresh')
            .set('x-csrf-token', csrf.body.csrfToken)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.token).toBeUndefined();
        expect(res.headers['set-cookie'].join(';')).toContain('itemize_auth=');
    });

    it('rejects session refresh without a refresh cookie', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const res = await request(createApp(pool))
            .post('/api/auth/refresh')
            .send({});

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('No refresh token provided');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('clears both session cookies on a csrf-protected logout', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async () => ({
            rows: [{
                id: 7,
                email: 'user@example.com',
                name: 'Test User',
                password_hash: passwordHash,
                provider: 'email',
                email_verified: true,
                role: 'USER',
            }],
        }));
        const agent = request.agent(createApp(pool));

        await agent
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' })
            .expect(200);
        const csrf = await agent.get('/api/auth/csrf').expect(200);
        const res = await agent
            .post('/api/auth/logout')
            .set('x-csrf-token', csrf.body.csrfToken)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const cookies = res.headers['set-cookie'].join(';').toLowerCase();
        expect(cookies).toContain('itemize_auth=');
        expect(cookies).toContain('itemize_refresh=');
        expect(cookies).toContain('max-age=0');
    });

    it('rejects current-user lookup without an authentication cookie', async () => {
        const pool = createPool(async () => ({ rows: [] }));

        const res = await request(createApp(pool)).get('/api/auth/me');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Authentication required');
        expect(res.headers['cache-control']).toContain('no-store');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('updates the authenticated profile with a trimmed name', async () => {
        const passwordHash = await bcrypt.hash('correct-password', 4);
        const pool = createPool(async sql => {
            if (String(sql).includes('password_hash')) {
                return {
                    rows: [{
                        id: 7,
                        email: 'user@example.com',
                        name: 'Test User',
                        password_hash: passwordHash,
                        provider: 'email',
                        email_verified: true,
                        role: 'USER',
                    }],
                };
            }
            if (String(sql).includes('UPDATE users SET name')) {
                return { rows: [{ id: 7, email: 'user@example.com', name: 'Updated User' }] };
            }
            return { rows: [] };
        });
        const agent = request.agent(createApp(pool));

        await agent
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: 'correct-password' })
            .expect(200);
        const csrf = await agent.get('/api/auth/csrf').expect(200);
        const res = await agent
            .put('/api/auth/me')
            .set('x-csrf-token', csrf.body.csrfToken)
            .send({ name: '  Updated User  ' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated User');
        const update = pool.client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE users SET name'));
        expect(update[1]).toEqual(['Updated User', 7]);
    });
});
