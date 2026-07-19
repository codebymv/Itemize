const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const {
    runBookingPublicCapabilityMigration,
} = require('../../db_booking_public_capability_migrations');

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
    await configureCalendarPolicy(app.locals.testPool, res.body.id);
    return res.body.id;
}

async function configureCalendarPolicy(pool, calendarId, settings = {}) {
    await pool.query(
        `UPDATE calendars
         SET timezone = $2,
             min_notice_hours = $3,
             max_future_days = $4,
             buffer_before_minutes = $5,
             buffer_after_minutes = $6,
             duration_minutes = COALESCE($7, duration_minutes),
             is_active = TRUE
         WHERE id = $1`,
        [
            calendarId,
            settings.timezone || 'UTC',
            settings.minNoticeHours ?? 0,
            settings.maxFutureDays ?? 365,
            settings.bufferBeforeMinutes ?? 0,
            settings.bufferAfterMinutes ?? 0,
            settings.durationMinutes ?? null,
        ]
    );
    await pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
    await pool.query(
        `INSERT INTO availability_windows (
           calendar_id, day_of_week, start_time, end_time, is_active
         )
         SELECT $1, day, '00:00:00', '23:59:59', TRUE
         FROM generate_series(0, 6) day`,
        [calendarId]
    );
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
        app.locals.testPool = dbHelper.pool;

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
            expect(b).not.toHaveProperty('cancellation_token');
            const capability = await dbHelper.pool.query(
                `SELECT cancellation_token, cancellation_token_hash,
                        cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [b.id]
            );
            expect(capability.rows[0]).toEqual({
                cancellation_token: null,
                cancellation_token_hash: null,
                cancellation_token_expires_at: null,
            });
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
        let confirmedId;

        beforeAll(async () => {
            calendarId = await seedCalendar(app, userA);

            const [, r2] = await Promise.all([
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

    describe('Public booking via global calendar ID', () => {
        let calendarSlug;
        let calendarPublicId;
        let calendarId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Public Booking Cal', is_active: true });
            calendarId = res.body.id;
            calendarSlug = res.body.slug;
            calendarPublicId = res.body.public_id;

            // Activate it (it defaults to true already, but ensure it)
            await dbHelper.pool.query(
                'UPDATE calendars SET is_active = TRUE WHERE id = $1',
                [calendarId]
            );
            await configureCalendarPolicy(dbHelper.pool, calendarId, {
                durationMinutes: 60,
            });
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM bookings WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('fetches public calendar info by global ID without auth', async () => {
            const res = await request(app)
                .get(`/api/bookings/public/book/${calendarPublicId}`);

            expect(res.status).toBe(200);
            expect(res.body.slug).toBe(calendarSlug);
            expect(res.body.public_id).toBe(calendarPublicId);
            expect(Array.isArray(res.body.availability)).toBe(true);
        });

        it('retains an unambiguous legacy slug fallback', async () => {
            const res = await request(app)
                .get(`/api/bookings/public/book/${calendarSlug}`);

            expect(res.status).toBe(200);
            expect(res.body.public_id).toBe(calendarPublicId);
        });

        it('returns 404 for unknown slug', async () => {
            const res = await request(app)
                .get('/api/bookings/public/book/no-such-calendar-slug-xyz');

            expect(res.status).toBe(404);
        });

        it('creates a public booking without auth', async () => {
            const slot = futureSlot(216);
            const res = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}`)
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
            const capability = await dbHelper.pool.query(
                `SELECT cancellation_token, cancellation_token_hash,
                        cancellation_token_expires_at, end_time
                 FROM bookings
                 WHERE id = $1`,
                [res.body.booking.id]
            );
            expect(capability.rows[0].cancellation_token).toBeNull();
            expect(capability.rows[0].cancellation_token_hash).toBe(
                crypto.createHash('sha256')
                    .update(res.body.booking.cancellation_token, 'utf8')
                    .digest('hex')
            );
            expect(
                new Date(capability.rows[0].cancellation_token_expires_at).getTime()
                - new Date(capability.rows[0].end_time).getTime()
            ).toBe(86400000);
        });

        it('links canonical duplicate email to the lowest organization contact ID', async () => {
            const email = `public-identity-${Date.now()}@test.itemize`;
            const contacts = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, created_by)
                 VALUES ($1, 'Booking Identity First', $2, $3),
                        ($1, 'Booking Identity Duplicate', $2, $3)
                 RETURNING id`,
                [userA.org.id, email, userA.user.id]
            );
            const res = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}`)
                .send({
                    attendee_name: 'Canonical Booker',
                    attendee_email: `  ${email.toUpperCase()}  `,
                    timezone: 'UTC',
                    ...futureSlot(228),
                });

            expect(res.status).toBe(201);
            const persisted = await dbHelper.pool.query(
                'SELECT contact_id FROM bookings WHERE id = $1',
                [res.body.booking.id]
            );
            expect(persisted.rows[0].contact_id).toBe(
                Math.min(...contacts.rows.map(row => row.id))
            );
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
        let calendarPublicId;

        beforeAll(async () => {
            const calendar = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `Booking Invariants ${Date.now()}`, duration_minutes: 60 });
            calendarId = calendar.body.id;
            calendarSlug = calendar.body.slug;
            calendarPublicId = calendar.body.public_id;
            await configureCalendarPolicy(dbHelper.pool, calendarId);
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
                .post(`/api/bookings/public/book/${calendarPublicId}`)
                .send({ attendee_name: 'Cancellation Test', attendee_email: 'cancel-public@test.com', ...futureSlot(336) });
            const token = createRes.body.booking.cancellation_token;

            const stored = await dbHelper.pool.query(
                `SELECT cancellation_token, cancellation_token_hash
                 FROM bookings
                 WHERE id = $1`,
                [createRes.body.booking.id]
            );
            expect(stored.rows[0]).toEqual({
                cancellation_token: null,
                cancellation_token_hash: crypto.createHash('sha256')
                    .update(token, 'utf8')
                    .digest('hex'),
            });

            const wrongSlug = await request(app)
                .post(`/api/bookings/public/book/not-${calendarSlug}/cancel/${token}`)
                .send({});
            expect(wrongSlug.status).toBe(404);

            const cancelled = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}/cancel/${token}`)
                .send({ reason: 'Cannot attend' });
            expect(cancelled.status).toBe(200);

            const consumed = await dbHelper.pool.query(
                `SELECT cancellation_token_hash, cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [createRes.body.booking.id]
            );
            expect(consumed.rows[0]).toEqual({
                cancellation_token_hash: null,
                cancellation_token_expires_at: null,
            });

            const replay = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}/cancel/${token}`)
                .send({});
            expect(replay.status).toBe(404);
        });

        it('rejects an expired cancellation capability', async () => {
            const createRes = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}`)
                .send({ attendee_name: 'Expired Capability', attendee_email: 'expired-public@test.com', ...futureSlot(360) });
            const token = createRes.body.booking.cancellation_token;
            await dbHelper.pool.query(
                `UPDATE bookings
                 SET cancellation_token_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
                 WHERE id = $1`,
                [createRes.body.booking.id]
            );

            const expired = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}/cancel/${token}`)
                .send({});
            expect(expired.status).toBe(404);
        });

        it('keeps the public capability aligned with authenticated lifecycle changes', async () => {
            const createRes = await request(app)
                .post(`/api/bookings/public/book/${calendarPublicId}`)
                .send({ attendee_name: 'Operator Lifecycle', attendee_email: 'operator-lifecycle@test.com', ...futureSlot(372) });
            const rescheduledSlot = futureSlot(396);
            const rescheduled = await request(app)
                .patch(`/api/bookings/${createRes.body.booking.id}/reschedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(rescheduledSlot);
            expect(rescheduled.status).toBe(200);

            const movedCapability = await dbHelper.pool.query(
                `SELECT cancellation_token_hash, cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [createRes.body.booking.id]
            );
            expect(movedCapability.rows[0].cancellation_token_hash).not.toBeNull();
            expect(
                new Date(movedCapability.rows[0].cancellation_token_expires_at).getTime()
                - new Date(rescheduledSlot.end_time).getTime()
            ).toBe(86400000);

            const cancelled = await request(app)
                .patch(`/api/bookings/${createRes.body.booking.id}/cancel`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ reason: 'Operator cancellation' });
            expect(cancelled.status).toBe(200);
            const revoked = await dbHelper.pool.query(
                `SELECT cancellation_token_hash, cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [createRes.body.booking.id]
            );
            expect(revoked.rows[0]).toEqual({
                cancellation_token_hash: null,
                cancellation_token_expires_at: null,
            });
        });

        it('migrates useful legacy raw tokens once and preserves hashes on rerun', async () => {
            const legacyToken = `legacy-${Date.now()}`;
            const slot = futureSlot(384);
            await dbHelper.pool.query(
                'ALTER TABLE bookings DROP CONSTRAINT bookings_raw_cancellation_token_forbidden'
            );
            const legacy = await dbHelper.pool.query(
                `INSERT INTO bookings (
                   organization_id, calendar_id, start_time, end_time, timezone,
                   attendee_name, attendee_email, status, cancellation_token, source
                 ) VALUES ($1, $2, $3, $4, 'UTC', 'Legacy Capability',
                           'legacy-capability@test.com', 'confirmed', $5, 'booking_page')
                 RETURNING id`,
                [userA.org.id, calendarId, slot.start_time, slot.end_time, legacyToken]
            );

            await runBookingPublicCapabilityMigration(dbHelper.pool);
            const first = await dbHelper.pool.query(
                `SELECT cancellation_token, cancellation_token_hash,
                        cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [legacy.rows[0].id]
            );
            await runBookingPublicCapabilityMigration(dbHelper.pool);
            const second = await dbHelper.pool.query(
                `SELECT cancellation_token, cancellation_token_hash,
                        cancellation_token_expires_at
                 FROM bookings
                 WHERE id = $1`,
                [legacy.rows[0].id]
            );

            expect(first.rows[0].cancellation_token).toBeNull();
            expect(first.rows[0].cancellation_token_hash).toBe(
                crypto.createHash('sha256').update(legacyToken, 'utf8').digest('hex')
            );
            expect(second.rows[0]).toEqual(first.rows[0]);
        });
    });

    describe('Server-authoritative availability policy', () => {
        let calendarId;
        let calendarSlug;
        let calendarPublicId;
        let connectionId;
        const overrideDate = '2027-03-10';

        beforeAll(async () => {
            const calendar = await request(app)
                .post('/api/calendars')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    name: `Availability Policy ${Date.now()}`,
                    duration_minutes: 30,
                });
            calendarId = calendar.body.id;
            calendarSlug = calendar.body.slug;
            calendarPublicId = calendar.body.public_id;
            await configureCalendarPolicy(dbHelper.pool, calendarId, {
                maxFutureDays: 1000,
                timezone: 'UTC',
            });
            await dbHelper.pool.query(
                `INSERT INTO calendar_date_overrides (
                   calendar_id, override_date, is_available, start_time, end_time
                 ) VALUES ($1, $2, TRUE, '09:00:00', '10:00:00')`,
                [calendarId, overrideDate]
            );
            const connection = await dbHelper.pool.query(
                `INSERT INTO calendar_connections (
                   user_id, organization_id, provider, provider_account_id,
                   access_token, sync_enabled
                 ) VALUES ($1, $2, 'google', $3, 'test-token', TRUE)
                 RETURNING id`,
                [userA.user.id, userA.org.id, `availability-${Date.now()}`]
            );
            connectionId = connection.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM calendar_connections WHERE id = $1', [connectionId]);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [calendarId]);
        });

        it('returns bounded authoritative slots rather than raw scheduling inputs', async () => {
            const response = await request(app)
                .get(`/api/bookings/public/book/${calendarSlug}/slots`)
                .query({ start_date: overrideDate, end_date: overrideDate });

            expect(response.status).toBe(200);
            expect(response.body).not.toHaveProperty('availability');
            expect(response.body).not.toHaveProperty('overrides');
            expect(response.body).not.toHaveProperty('booked_slots');
            expect(response.body.slots).toEqual([
                {
                    start_time: `${overrideDate}T09:00:00.000Z`,
                    end_time: `${overrideDate}T09:30:00.000Z`,
                },
                {
                    start_time: `${overrideDate}T09:30:00.000Z`,
                    end_time: `${overrideDate}T10:00:00.000Z`,
                },
            ]);

            const excessive = await request(app)
                .get(`/api/bookings/public/book/${calendarSlug}/slots`)
                .query({ start_date: overrideDate, end_date: '2027-04-10' });
            expect(excessive.status).toBe(400);
        });

        it('revalidates a selected public slot and applies calendar buffers', async () => {
            await dbHelper.pool.query(
                `UPDATE calendars
                 SET buffer_before_minutes = 10,
                     buffer_after_minutes = 5
                 WHERE id = $1`,
                [calendarId]
            );
            const first = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}`)
                .send({
                    attendee_name: 'Authoritative Slot',
                    attendee_email: 'authoritative-slot@test.com',
                    start_time: `${overrideDate}T09:00:00.000Z`,
                    end_time: `${overrideDate}T09:30:00.000Z`,
                    timezone: 'UTC',
                });
            expect(first.status).toBe(201);

            const adjacent = await request(app)
                .post(`/api/bookings/public/book/${calendarSlug}`)
                .send({
                    attendee_name: 'Buffered Slot',
                    attendee_email: 'buffered-slot@test.com',
                    start_time: `${overrideDate}T09:30:00.000Z`,
                    end_time: `${overrideDate}T10:00:00.000Z`,
                    timezone: 'UTC',
                });
            expect(adjacent.status).toBe(409);
            expect(adjacent.body.reason).toBe('BOOKING_CONFLICT');
        });

        it('enforces notice, horizon, overrides, and normalized external busy intervals', async () => {
            await dbHelper.pool.query(
                `UPDATE calendars
                 SET min_notice_hours = 1,
                     max_future_days = 30,
                     buffer_before_minutes = 0,
                     buffer_after_minutes = 0
                 WHERE id = $1`,
                [calendarId]
            );
            const boundedReasons = await dbHelper.pool.query(
                `SELECT
                   booking_slot_policy_reason(
                     $1, '2027-03-10T09:00:00Z', '2027-03-10T09:30:00Z',
                     NULL, TRUE, '2027-03-10T08:30:01Z'
                   ) AS notice,
                   booking_slot_policy_reason(
                     $1, '2027-03-10T09:00:00Z', '2027-03-10T09:30:00Z',
                     NULL, TRUE, '2027-01-01T00:00:00Z'
                   ) AS horizon`,
                [calendarId]
            );
            expect(boundedReasons.rows[0]).toEqual({
                notice: 'MIN_NOTICE',
                horizon: 'MAX_FUTURE',
            });

            await dbHelper.pool.query(
                `UPDATE calendars
                 SET min_notice_hours = 0, max_future_days = 1000
                 WHERE id = $1`,
                [calendarId]
            );
            await dbHelper.pool.query(
                `INSERT INTO calendar_external_busy_intervals (
                   organization_id, calendar_id, connection_id, external_calendar_id,
                   external_event_id, start_time, end_time
                 ) VALUES (
                   $1, $2, $3, 'primary', 'busy-1',
                   '2027-03-11T12:00:00Z', '2027-03-11T13:00:00Z'
                 )`,
                [userA.org.id, calendarId, connectionId]
            );
            const busy = await dbHelper.pool.query(
                `SELECT booking_slot_policy_reason(
                   $1, '2027-03-11T12:15:00Z', '2027-03-11T12:45:00Z',
                   NULL, TRUE, '2027-01-01T00:00:00Z'
                 ) AS reason`,
                [calendarId]
            );
            expect(busy.rows[0].reason).toBe('EXTERNAL_BUSY');

            await expect(
                dbHelper.pool.query(
                    `INSERT INTO calendar_external_busy_intervals (
                       organization_id, calendar_id, connection_id,
                       external_calendar_id, external_event_id, start_time, end_time
                     ) VALUES (
                       $1, $2, $3, 'primary', 'cross-tenant',
                       '2027-03-12T12:00:00Z', '2027-03-12T13:00:00Z'
                     )`,
                    [userB.org.id, calendarId, connectionId]
                )
            ).rejects.toMatchObject({
                constraint: 'calendar_external_busy_interval_tenant',
            });
        });

        it('omits nonexistent DST times and resolves repeated wall times once', async () => {
            await dbHelper.pool.query(
                `UPDATE calendars
                 SET timezone = 'America/New_York',
                     min_notice_hours = 0,
                     max_future_days = 1000,
                     duration_minutes = 30
                 WHERE id = $1`,
                [calendarId]
            );
            await dbHelper.pool.query('DELETE FROM calendar_date_overrides WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query('DELETE FROM availability_windows WHERE calendar_id = $1', [calendarId]);
            await dbHelper.pool.query(
                `INSERT INTO availability_windows (
                   calendar_id, day_of_week, start_time, end_time, is_active
                 ) VALUES ($1, 0, '00:00:00', '04:00:00', TRUE)`,
                [calendarId]
            );

            const spring = await dbHelper.pool.query(
                `SELECT start_time
                 FROM booking_available_slots(
                   $1, '2027-03-14', '2027-03-14', '2027-03-13T00:00:00Z'
                 )`,
                [calendarId]
            );
            const fall = await dbHelper.pool.query(
                `SELECT start_time
                 FROM booking_available_slots(
                   $1, '2027-11-07', '2027-11-07', '2027-11-06T00:00:00Z'
                 )`,
                [calendarId]
            );
            const localLabels = (rows) => rows.map((row) =>
                new Intl.DateTimeFormat('en-CA', {
                    hour: '2-digit',
                    hour12: false,
                    minute: '2-digit',
                    timeZone: 'America/New_York',
                }).format(row.start_time)
            );
            expect(localLabels(spring.rows)).not.toContain('02:00');
            expect(new Set(localLabels(fall.rows)).size).toBe(fall.rows.length);
            expect(localLabels(fall.rows).filter((value) => value === '01:00')).toHaveLength(1);
        });

        it('fails closed when a public slug is ambiguous across organizations', async () => {
            const duplicate = await dbHelper.pool.query(
                `INSERT INTO calendars (
                   organization_id, name, slug, timezone, duration_minutes,
                   min_notice_hours, max_future_days, is_active
                 ) VALUES ($1, 'Ambiguous Calendar', $2, 'UTC', 30, 0, 365, TRUE)
                 RETURNING id`,
                [userB.org.id, calendarSlug]
            );
            const response = await request(app)
                .get(`/api/bookings/public/book/${calendarSlug}`);
            expect(response.status).toBe(404);
            const globalResponse = await request(app)
                .get(`/api/bookings/public/book/${calendarPublicId}`);
            expect(globalResponse.status).toBe(200);
            await dbHelper.pool.query('DELETE FROM calendars WHERE id = $1', [
                duplicate.rows[0].id,
            ]);
        });
    });

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated booking list', async () => {
            const res = await request(app).get('/api/bookings');
            expect(res.status).toBe(401);
        });
    });
});
