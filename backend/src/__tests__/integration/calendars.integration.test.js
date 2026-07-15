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
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

const DEFAULT_AVAILABILITY = [
    { day_of_week: 1, start_time: '09:00', end_time: '17:00' },
    { day_of_week: 2, start_time: '09:00', end_time: '17:00' },
    { day_of_week: 3, start_time: '09:00', end_time: '17:00' },
    { day_of_week: 4, start_time: '09:00', end_time: '17:00' },
    { day_of_week: 5, start_time: '09:00', end_time: '17:00' },
];

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Calendars Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`cal-a-${Date.now()}@test.itemize`, 'Calendar User A'),
            dbHelper.seedUser(`cal-b-${Date.now()}@test.itemize`, 'Calendar User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD & multi-tenant isolation ─────────────────────────────────────────

    describe('Calendar CRUD', () => {
        let calendarId;

        it('creates a calendar with default availability', async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Sales Calls',
                    description: 'Book a sales call',
                    timezone: 'America/New_York',
                    duration_minutes: 30,
                    color: '#3B82F6',
                });

            expect(res.status).toBe(201);
            const cal = res.body;
            expect(cal.name).toBe('Sales Calls');
            expect(cal.duration_minutes).toBe(30);
            expect(cal.organization_id).toBe(userA.org.id);
            expect(typeof cal.slug).toBe('string');
            calendarId = cal.id;
        });

        it('creates a calendar with custom availability windows', async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: 'Tue-Thu Only',
                    availability_windows: [
                        { day_of_week: 2, start_time: '10:00', end_time: '15:00' },
                        { day_of_week: 4, start_time: '10:00', end_time: '15:00' },
                    ],
                });

            expect(res.status).toBe(201);

            // Cleanup
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [res.body.id]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [res.body.id]);
        });

        it('rejects creation without a name', async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ description: 'No name' });

            expect(res.status).toBe(400);
        });

        it('lists calendars for User A org', async () => {
            const res = await request(app)
                .get('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.calendars)).toBe(true);
            expect(res.body.calendars.some(c => c.id === calendarId)).toBe(true);
        });

        it('User B org cannot see User A calendars', async () => {
            const res = await request(app)
                .get('/api/calendars')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.calendars.every(c => c.organization_id === userB.org.id)).toBe(true);
            expect(res.body.calendars.some(c => c.id === calendarId)).toBe(false);
        });

        it('fetches a single calendar with availability windows and date overrides', async () => {
            const res = await request(app)
                .get(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(calendarId);
            expect(Array.isArray(res.body.availability_windows)).toBe(true);
            // Default Mon-Fri should be created
            expect(res.body.availability_windows.length).toBe(5);
            expect(Array.isArray(res.body.date_overrides)).toBe(true);
        });

        it('User B cannot fetch User A calendar', async () => {
            const res = await request(app)
                .get(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates a calendar', async () => {
            const res = await request(app)
                .put(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Updated Sales Calls', duration_minutes: 60, color: '#EF4444' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Sales Calls');
            expect(res.body.duration_minutes).toBe(60);
            expect(res.body.color).toBe('#EF4444');
        });

        it('User B cannot update User A calendar', async () => {
            const res = await request(app)
                .put(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a calendar with no upcoming bookings', async () => {
            const res = await request(app)
                .delete(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
        });

        it('returns 404 when deleting already-deleted calendar', async () => {
            const res = await request(app)
                .delete(`/api/calendars/${calendarId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Delete blocked by upcoming bookings ───────────────────────────────────

    describe('Delete protection with upcoming bookings', () => {
        let protectedCalId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Booked Calendar' });
            protectedCalId = res.body.id;

            // Insert a confirmed upcoming booking manually (must include timezone — NOT NULL)
            await dbHelper.pool.query(
                `INSERT INTO bookings (organization_id, calendar_id, start_time, end_time, 
                 timezone, attendee_name, attendee_email, status, cancellation_token)
                 VALUES ($1, $2, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour',
                 'UTC', 'Test Attendee', 'attendee@test.com', 'confirmed', 'tok-${Date.now()}')`,
                [userA.org.id, protectedCalId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [protectedCalId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [protectedCalId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [protectedCalId]);
        });

        it('blocks deletion when calendar has upcoming confirmed bookings', async () => {
            const res = await request(app)
                .delete(`/api/calendars/${protectedCalId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/booking/i);
        });
    });

    // ── Availability windows management ───────────────────────────────────────

    describe('Availability windows', () => {
        let calendarId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Availability Test Cal' });
            calendarId = res.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('replaces availability windows via PUT', async () => {
            const newWindows = [
                { day_of_week: 1, start_time: '08:00', end_time: '12:00', is_active: true },
                { day_of_week: 3, start_time: '14:00', end_time: '18:00', is_active: true },
            ];

            const res = await request(app)
                .put(`/api/calendars/${calendarId}/availability`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ availability_windows: newWindows });

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.availability_windows)).toBe(true);
            expect(res.body.availability_windows).toHaveLength(2);
            expect(res.body.availability_windows[0].day_of_week).toBe(1);
            expect(res.body.availability_windows[0].start_time).toBe('08:00:00');
        });

        it('rejects availability update with non-array', async () => {
            const res = await request(app)
                .put(`/api/calendars/${calendarId}/availability`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ availability_windows: 'invalid' });

            expect(res.status).toBe(400);
        });

        it('can clear all availability windows', async () => {
            const res = await request(app)
                .put(`/api/calendars/${calendarId}/availability`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ availability_windows: [] });

            expect(res.status).toBe(200);
            expect(res.body.availability_windows).toHaveLength(0);
        });
    });

    // ── Date overrides ────────────────────────────────────────────────────────

    describe('Date overrides', () => {
        let calendarId;
        let overrideId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Override Test Cal' });
            calendarId = res.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM calendar_date_overrides WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('rejects date override without override_date', async () => {
            const res = await request(app)
                .post(`/api/calendars/${calendarId}/date-override`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ is_available: false });

            expect(res.status).toBe(400);
        });

        it('adds a date override (block a day)', async () => {
            const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000)
                .toISOString().split('T')[0];

            const res = await request(app)
                .post(`/api/calendars/${calendarId}/date-override`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ override_date: futureDate, is_available: false, reason: 'Holiday' });

            expect(res.status).toBe(200);
            expect(res.body.override_date).toBeTruthy();
            expect(res.body.is_available).toBe(false);
            overrideId = res.body.id;
        });

        it('upserts the same date override', async () => {
            const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000)
                .toISOString().split('T')[0];

            const res = await request(app)
                .post(`/api/calendars/${calendarId}/date-override`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ override_date: futureDate, is_available: true, reason: 'Actually available' });

            expect(res.status).toBe(200);
            expect(res.body.is_available).toBe(true);
        });

        it('deletes a date override', async () => {
            const res = await request(app)
                .delete(`/api/calendars/${calendarId}/date-override/${overrideId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 deleting a non-existent override', async () => {
            const res = await request(app)
                .delete(`/api/calendars/${calendarId}/date-override/999999`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/calendars');
            expect(res.status).toBe(401);
        });
    });
});
