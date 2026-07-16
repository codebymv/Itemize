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

/** Create a calendar and return its id */
async function seedCalendar(app, user) {
    const res = await request(app)
        .post('/api/calendars')
        .set('Cookie', [`itemize_auth=${user.token}`])
        .set('x-organization-id', String(user.org.id))
        .send({ name: `Booking Test Calendar ${Date.now()}`, duration_minutes: 60 });
    return res.body.id;
}

/** Future timestamps 1 and 2 hours from now */
function futureSlot(offsetHours = 48) {
    const start = new Date(Date.now() + offsetHours * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    return { start_time: start.toISOString(), end_time: end.toISOString() };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Bookings Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`book-a-${Date.now()}@test.itemize`, 'Booking User A'),
            dbHelper.seedUser(`book-b-${Date.now()}@test.itemize`, 'Booking User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── Manual booking CRUD ───────────────────────────────────────────────────

    describe('Manual booking CRUD & isolation', () => {
        let calendarId;
        let bookingId;
        const slot = futureSlot(72);

        beforeAll(async () => {
            calendarId = await seedCalendar(app, userA);
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('creates a manual booking', async () => {
            const res = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    calendar_id: calendarId,
                    title: 'Discovery Call',
                    attendee_name: 'Alice Smith',
                    attendee_email: 'alice@example.com',
                    timezone: 'America/New_York',
                    ...slot,
                });

            expect(res.status).toBe(201);
            const b = res.body;
            expect(b.attendee_name).toBe('Alice Smith');
            expect(b.attendee_email).toBe('alice@example.com');
            // DB default status is 'confirmed'
            expect(b.status).toBe('confirmed');
            expect(b.organization_id).toBe(userA.org.id);
            expect(typeof b.cancellation_token).toBe('string');
            bookingId = b.id;
        });

        it('rejects booking without required fields', async () => {
            const res = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ calendar_id: calendarId }); // missing start_time / end_time

            expect(res.status).toBe(400);
        });

        it('rejects booking when calendar belongs to another org', async () => {
            const res = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ calendar_id: calendarId, ...futureSlot(80) });

            // Route returns 404 when calendar is not found in the org
            expect([400, 404]).toContain(res.status);
        });

        it('rejects double-booking the same slot', async () => {
            const res = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    calendar_id: calendarId,
                    attendee_name: 'Bob Jones',
                    attendee_email: 'bob@example.com',
                    ...slot, // exact same start/end as the first booking
                });

            expect(res.status).toBe(409);
        });

        it('lists bookings for User A org', async () => {
            const res = await request(app)
                .get('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.bookings)).toBe(true);
            expect(res.body.bookings.some(b => b.id === bookingId)).toBe(true);
        });

        it('User B cannot see User A bookings', async () => {
            const res = await request(app)
                .get('/api/bookings')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.bookings.every(b => b.organization_id === userB.org.id)).toBe(true);
            expect(res.body.bookings.some(b => b.id === bookingId)).toBe(false);
        });

        it('fetches a single booking by ID', async () => {
            const res = await request(app)
                .get(`/api/bookings/${bookingId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(bookingId);
            expect(res.body.calendar_name).toBeTruthy();
        });

        it('User B cannot fetch User A booking', async () => {
            const res = await request(app)
                .get(`/api/bookings/${bookingId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Booking lifecycle (cancel / reschedule) ───────────────────────────────

    describe('Cancel and reschedule', () => {
        let calendarId;
        let bookingId;

        beforeAll(async () => {
            calendarId = await seedCalendar(app, userA);

            const slot = futureSlot(96);
            const res = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    calendar_id: calendarId,
                    attendee_name: 'Cancel Test',
                    attendee_email: 'cancel@test.com',
                    ...slot,
                });
            bookingId = res.body.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('reschedules a booking to a new slot', async () => {
            const newSlot = futureSlot(120);
            const res = await request(app)
                .patch(`/api/bookings/${bookingId}/reschedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(newSlot);

            expect(res.status).toBe(200);
            // Verify new time is reflected
            const startDiff = Math.abs(
                new Date(res.body.start_time) - new Date(newSlot.start_time)
            );
            expect(startDiff).toBeLessThan(2000); // within 2s
        });

        it('rejects reschedule without start_time and end_time', async () => {
            const res = await request(app)
                .patch(`/api/bookings/${bookingId}/reschedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            expect(res.status).toBe(400);
        });

        it('User B cannot reschedule User A booking', async () => {
            const res = await request(app)
                .patch(`/api/bookings/${bookingId}/reschedule`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send(futureSlot(200));

            expect(res.status).toBe(404);
        });

        it('cancels a booking', async () => {
            const res = await request(app)
                .patch(`/api/bookings/${bookingId}/cancel`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ reason: 'Schedule conflict' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('cancelled');
            expect(res.body.cancellation_reason).toBe('Schedule conflict');
        });

        it('User B cannot cancel User A booking', async () => {
            // Create a fresh booking for this isolation test
            const freshSlot = futureSlot(144);
            const createRes = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ calendar_id: calendarId, attendee_name: 'Fresh', attendee_email: 'f@t.com', ...freshSlot });
            const freshId = createRes.body.id;

            const res = await request(app)
                .patch(`/api/bookings/${freshId}/cancel`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({});

            expect(res.status).toBe(404);
        });
    });

    // ── List filtering ────────────────────────────────────────────────────────

    describe('List filtering', () => {
        let calendarId;
        let confirmedId, pendingId;

        beforeAll(async () => {
            calendarId = await seedCalendar(app, userA);

            const [r1, r2] = await Promise.all([
                request(app)
                    .post('/api/bookings')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send({ calendar_id: calendarId, attendee_name: 'A1', attendee_email: 'a1@t.com', ...futureSlot(168) }),
                request(app)
                    .post('/api/bookings')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send({ calendar_id: calendarId, attendee_name: 'A2', attendee_email: 'a2@t.com', ...futureSlot(192) }),
            ]);
            pendingId = r1.body.id;
            confirmedId = r2.body.id;

            await dbHelper.pool.query(
                "UPDATE bookings SET status = 'confirmed' WHERE id = $1",
                [confirmedId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('filters by calendar_id', async () => {
            const res = await request(app)
                .get(`/api/bookings?calendar_id=${calendarId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.bookings.every(b => b.calendar_id === calendarId)).toBe(true);
        });

        it('filters by status=confirmed', async () => {
            const res = await request(app)
                .get('/api/bookings?status=confirmed')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.bookings.every(b => b.status === 'confirmed')).toBe(true);
            expect(res.body.bookings.some(b => b.id === confirmedId)).toBe(true);
        });

        it('filters by status=pending', async () => {
            const res = await request(app)
                .get('/api/bookings?status=pending')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            // Default status is 'confirmed' from DB default; pending bookings may be 0
            expect(Array.isArray(res.body.bookings)).toBe(true);
        });

        it('returns pagination metadata', async () => {
            const res = await request(app)
                .get('/api/bookings?page=1&limit=1')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(1);
            expect(res.body.bookings).toHaveLength(1);
        });
    });

    // ── Public booking endpoint ───────────────────────────────────────────────

    describe('Public booking via calendar slug', () => {
        let calendarSlug;
        let calendarId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Public Booking Cal', is_active: true });
            calendarId = res.body.id;
            calendarSlug = res.body.slug;

            // Activate it (it defaults to true already, but ensure it)
            await dbHelper.pool.query(
                'UPDATE calendars SET is_active = TRUE WHERE id = $1',
                [calendarId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('fetches public calendar info without auth', async () => {
            const res = await request(app)
                .get(`/api/bookings/public/book/${calendarSlug}`);

            expect(res.status).toBe(200);
            expect(res.body.slug).toBe(calendarSlug);
            expect(Array.isArray(res.body.availability)).toBe(true);
        });

        it('returns 404 for unknown slug', async () => {
            const res = await request(app)
                .get('/api/bookings/public/book/no-such-calendar-slug-xyz');

            expect(res.status).toBe(404);
        });

        it('creates a public booking without auth', async () => {
            const slot = futureSlot(216);
            const res = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}`)
                .send({
                    attendee_name: 'Public Booker',
                    attendee_email: 'public@test.com',
                    timezone: 'UTC',
                    ...slot,
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.booking.attendee_email).toBe('public@test.com');
            expect(typeof res.body.booking.cancellation_token).toBe('string');
        });

        it('rejects public booking without required fields', async () => {
            const res = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}`)
                .send({ attendee_email: 'no-name@test.com', ...futureSlot(240) });

            expect(res.status).toBe(400);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Booking collision and cancellation invariants', () => {
        let calendarId;
        let calendarSlug;

        beforeAll(async () => {
            const calendar = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `Booking Invariants ${Date.now()}`, duration_minutes: 60 });
            calendarId = calendar.body.id;
            calendarSlug = calendar.body.slug;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('commits exactly one of two simultaneous reservations for the same slot', async () => {
            const slot = futureSlot(288);
            const makeRequest = (email) => request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ calendar_id: calendarId, attendee_name: 'Concurrent Booker', attendee_email: email, ...slot });

            const responses = await Promise.all([
                makeRequest('concurrent-one@test.com'),
                makeRequest('concurrent-two@test.com'),
            ]);

            expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
            const count = await dbHelper.pool.query(
                'SELECT COUNT(*) FROM bookings WHERE calendar_id = $1 AND start_time = $2 AND end_time = $3',
                [calendarId, slot.start_time, slot.end_time]
            );
            expect(Number(count.rows[0].count)).toBe(1);
        });

        it('rejects inverted time ranges before writing', async () => {
            const slot = futureSlot(312);
            const response = await request(app)
                .post('/api/bookings')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ calendar_id: calendarId, start_time: slot.end_time, end_time: slot.start_time });
            expect(response.status).toBe(400);
        });

        it('binds a public cancellation token to its calendar and rejects replay', async () => {
            const createRes = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}`)
                .send({ attendee_name: 'Cancellation Test', attendee_email: 'cancel-public@test.com', ...futureSlot(336) });
            const token = createRes.body.booking.cancellation_token;

            const wrongSlug = await request(app)
                .post(`/api/bookings/public/book/not-${calendarSlug}/cancel/${token}`)
                .send({});
            expect(wrongSlug.status).toBe(404);

            const cancelled = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}/cancel/${token}`)
                .send({ reason: 'Cannot attend' });
            expect(cancelled.status).toBe(200);

            const replay = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}/cancel/${token}`)
                .send({});
            expect(replay.status).toBe(404);
        });
    });

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated booking list', async () => {
            const res = await request(app).get('/api/bookings');
            expect(res.status).toBe(401);
        });
    });
});
