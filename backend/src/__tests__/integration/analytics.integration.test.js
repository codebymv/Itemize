jest.mock('../../services/usageTrackingService', () => class UsageTrackingService {
    async isWithinLimits() {
        return { withinLimits: true };
    }

    async incrementUsage() {}
});

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, _res, next) => { req.dbPool = pool; next(); });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    const broadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(), whiteboardUpdate: jest.fn(),
        wireframeUpdate: jest.fn(), userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast, io, port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return app;
}

describe('Analytics integration', () => {
    let dbHelper;
    let app;
    let userA;
    let userB;
    let defaultPipeline;
    let otherPipeline;

    const auth = user => ({
        Cookie: `itemize_auth=${user.token}`,
        'x-organization-id': String(user.org.id),
    });

    const get = (path, user = userA) => request(app).get(path).set(auth(user));

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`analytics-a-${Date.now()}@test.itemize`, 'Analytics User A'),
            dbHelper.seedUser(`analytics-b-${Date.now()}@test.itemize`, 'Analytics User B'),
        ]);

        const contactA = (await dbHelper.pool.query(`
            INSERT INTO contacts (organization_id, first_name, email, status, source, created_by)
            VALUES ($1, 'Recent', 'recent-a@analytics.test', 'active', 'manual', $2)
            RETURNING id
        `, [userA.org.id, userA.user.id])).rows[0];
        await Promise.all([
            dbHelper.pool.query(`
                INSERT INTO contacts (organization_id, first_name, email, status, source, created_by, created_at)
                VALUES ($1, 'Old', 'old-a@analytics.test', 'inactive', 'manual', $2, NOW() - INTERVAL '8 months')
            `, [userA.org.id, userA.user.id]),
            dbHelper.pool.query(`
                INSERT INTO contacts (organization_id, first_name, email, status, source, created_by)
                VALUES ($1, 'Other tenant', 'other@analytics.test', 'active', 'manual', $2)
            `, [userB.org.id, userB.user.id]),
        ]);

        const stages = JSON.stringify([
            { id: 'qualified', name: 'Qualified', color: '#123456' },
            { id: 'proposal', name: 'Proposal', color: '#654321' },
        ]);
        defaultPipeline = (await dbHelper.pool.query(`
            INSERT INTO pipelines (organization_id, name, stages, is_default, created_by)
            VALUES ($1, 'Primary', $2::jsonb, TRUE, $3) RETURNING id
        `, [userA.org.id, stages, userA.user.id])).rows[0];
        otherPipeline = (await dbHelper.pool.query(`
            INSERT INTO pipelines (organization_id, name, stages, is_default, created_by)
            VALUES ($1, 'Secondary', $2::jsonb, FALSE, $3) RETURNING id
        `, [userA.org.id, stages, userA.user.id])).rows[0];
        const foreignPipeline = (await dbHelper.pool.query(`
            INSERT INTO pipelines (organization_id, name, stages, is_default, created_by)
            VALUES ($1, 'Foreign', $2::jsonb, TRUE, $3) RETURNING id
        `, [userB.org.id, stages, userB.user.id])).rows[0];

        await Promise.all([
            dbHelper.pool.query(`
                INSERT INTO deals (organization_id, pipeline_id, contact_id, stage_id, title, value, created_by, won_at)
                VALUES ($1, $2, $3, 'qualified', 'Won deal', 100, $4, NOW())
            `, [userA.org.id, defaultPipeline.id, contactA.id, userA.user.id]),
            dbHelper.pool.query(`
                INSERT INTO deals (organization_id, pipeline_id, contact_id, stage_id, title, value, created_by)
                VALUES ($1, $2, $3, 'proposal', 'Open default deal', 25, $4)
            `, [userA.org.id, defaultPipeline.id, contactA.id, userA.user.id]),
            dbHelper.pool.query(`
                INSERT INTO deals (organization_id, pipeline_id, contact_id, stage_id, title, value, created_by)
                VALUES ($1, $2, $3, 'qualified', 'Open secondary deal', 999, $4)
            `, [userA.org.id, otherPipeline.id, contactA.id, userA.user.id]),
            dbHelper.pool.query(`
                INSERT INTO deals (organization_id, pipeline_id, stage_id, title, value, created_by, won_at)
                VALUES ($1, $2, 'qualified', 'Foreign won deal', 500, $3, NOW())
            `, [userB.org.id, foreignPipeline.id, userB.user.id]),
            dbHelper.pool.query(`
                INSERT INTO payments (organization_id, amount, payment_method, status, paid_at)
                VALUES ($1, 50, 'cash', 'succeeded', NOW())
            `, [userA.org.id]),
            dbHelper.pool.query(`
                INSERT INTO payments (organization_id, amount, payment_method, status, paid_at)
                VALUES ($1, 700, 'cash', 'succeeded', NOW())
            `, [userB.org.id]),
        ]);

        const calendar = (await dbHelper.pool.query(`
            INSERT INTO calendars (organization_id, name, slug, created_by)
            VALUES ($1, 'Analytics calendar', $2, $3) RETURNING id
        `, [userA.org.id, `analytics-${Date.now()}`, userA.user.id])).rows[0];
        await Promise.all([
            dbHelper.pool.query(`
                INSERT INTO bookings (organization_id, calendar_id, title, start_time, end_time, timezone, status)
                VALUES ($1, $2, 'Upcoming', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'UTC', 'confirmed')
            `, [userA.org.id, calendar.id]),
            dbHelper.pool.query(`
                INSERT INTO bookings (organization_id, calendar_id, title, start_time, end_time, timezone, status)
                VALUES ($1, $2, 'Cancelled future', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'UTC', 'cancelled')
            `, [userA.org.id, calendar.id]),
            dbHelper.pool.query(`
                INSERT INTO invoices (
                    organization_id, invoice_number, due_date, subtotal, total, amount_due, status, created_by
                ) VALUES ($1, $2, CURRENT_DATE + 7, 20, 20, 20, 'sent', $3)
            `, [userA.org.id, `AN-${Date.now()}`, userA.user.id]),
            dbHelper.pool.query(`
                INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, queued_at)
                VALUES ($1, $2, 'recent-a@analytics.test', 'Clicked', 'clicked', NOW())
            `, [userA.org.id, contactA.id]),
            dbHelper.pool.query(`
                INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, queued_at)
                VALUES ($1, $2, 'recent-a@analytics.test', 'Delivered', 'delivered', NOW())
            `, [userA.org.id, contactA.id]),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper?.teardown(); }, 30000);

    test.each([
        '/api/analytics/conversion-rates?period=forever',
        '/api/analytics/revenue-trends?period=forever',
    ])('rejects unsupported periods instead of silently running another range: %s', async path => {
        const response = await get(path);
        expect(response.status).toBe(400);
        expect(response.body.error.field).toBe('period');
    });

    test('conversion rates remain tenant-scoped while their lifecycle definition is retained', async () => {
        const response = await get('/api/analytics/conversion-rates?period=30days');
        expect(response.status).toBe(200);
        expect(response.body.data.period).toBe('30days');
        expect(response.body.data.conversions.dealWinRate).toMatchObject({
            won: 1,
            totalClosed: 1,
            wonValue: 100,
        });
    });

    test('revenue trends merge deal and payment revenue into one bucket without foreign data', async () => {
        const response = await get('/api/analytics/revenue-trends?period=30days');
        expect(response.status).toBe(200);
        expect(response.body.data.data).toHaveLength(1);
        expect(response.body.data.data[0]).toMatchObject({ dealsWon: 1, revenue: 150, cumulativeRevenue: 150 });
        expect(response.body.data.summary).toMatchObject({
            totalRevenue: 150,
            totalDeals: 1,
            totalPayments: 1,
            avgDealValue: 75,
        });
    });

    test('pipeline velocity validates IDs and does not enumerate another organization pipeline', async () => {
        const invalid = await get('/api/analytics/pipeline-velocity?pipeline_id=not-a-number');
        expect(invalid.status).toBe(400);
        expect(invalid.body.error.field).toBe('pipeline_id');

        const foreign = await get('/api/analytics/pipeline-velocity', userB);
        const hidden = await get(`/api/analytics/pipeline-velocity?pipeline_id=${foreign.body.data.pipeline.id}`);
        expect(hidden.status).toBe(200);
        expect(hidden.body.data).toEqual({ pipeline: null, velocity: [], summary: {} });
    });

});
