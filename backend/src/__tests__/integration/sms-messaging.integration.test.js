const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const smsService = require('../../services/smsService');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: false }));
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

describe('SMS messaging integration', () => {
    let dbHelper;
    let app;
    let userA;
    let userB;
    const originalSkipValidation = process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;

    beforeAll(async () => {
        process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`sms-a-${Date.now()}@test.itemize`, 'SMS User A'),
            dbHelper.seedUser(`sms-b-${Date.now()}@test.itemize`, 'SMS User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        if (originalSkipValidation === undefined) delete process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;
        else process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = originalSkipValidation;
        await dbHelper.teardown();
    }, 30000);

    afterEach(() => jest.restoreAllMocks());

    async function registerReceivingNumber(user, phoneNumber, { primary = false } = {}) {
        return (await dbHelper.pool.query(
            `INSERT INTO sms_receiving_numbers (
                organization_id, phone_number, is_primary, created_by
             ) VALUES ($1, $2, $3, $4)
             RETURNING id, organization_id, phone_number`,
            [user.org.id, phoneNumber, primary, user.user.id]
        )).rows[0];
    }

    test('CRUD remains organization scoped', async () => {
        const created = await request(app)
            .post('/api/sms-templates')
            .set('Cookie', [`itemize_auth=${userA.token}`])
            .set('x-organization-id', String(userA.org.id))
            .send({ name: 'Appointment', message: 'Hi {{first_name}}' });

        expect(created.status).toBe(201);
        expect(created.body.variables).toContain('first_name');

        const outsider = await request(app)
            .get(`/api/sms-templates/${created.body.id}`)
            .set('Cookie', [`itemize_auth=${userB.token}`])
            .set('x-organization-id', String(userB.org.id));
        expect(outsider.status).toBe(404);
    });

    test('a receiving number has exactly one owning organization', async () => {
        const receivingNumber = `+1602554${String(Date.now()).slice(-4)}`;
        await registerReceivingNumber(userA, receivingNumber);

        await expect(registerReceivingNumber(userB, receivingNumber))
            .rejects.toMatchObject({ code: '23505' });
    });

    test('successful contact send writes the provider log and activity contract', async () => {
        const contact = (await dbHelper.pool.query(
            `INSERT INTO contacts (organization_id, first_name, phone, created_by)
             VALUES ($1, 'Ada', '+16025550101', $2) RETURNING id`,
            [userA.org.id, userA.user.id]
        )).rows[0];
        jest.spyOn(smsService, 'sendSms').mockResolvedValue({
            success: true,
            id: `SM${Date.now()}`,
            status: 'sent',
        });

        const response = await request(app)
            .post('/api/sms-templates/send-to-contact')
            .set('Cookie', [`itemize_auth=${userA.token}`])
            .set('x-organization-id', String(userA.org.id))
            .send({ contact_id: contact.id, message: 'Hello {{first_name}}' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        const [logs, activities] = await Promise.all([
            dbHelper.pool.query('SELECT * FROM sms_logs WHERE contact_id = $1 AND direction = $2', [contact.id, 'outbound']),
            dbHelper.pool.query('SELECT * FROM contact_activities WHERE contact_id = $1 AND type = $2', [contact.id, 'sms']),
        ]);
        expect(logs.rows).toHaveLength(1);
        expect(activities.rows).toHaveLength(1);
    });

    test('an unavailable provider is not reported as a successful contact send', async () => {
        const contact = (await dbHelper.pool.query(
            `INSERT INTO contacts (organization_id, first_name, phone, created_by)
             VALUES ($1, 'Grace', '+16025550102', $2) RETURNING id`,
            [userA.org.id, userA.user.id]
        )).rows[0];
        jest.spyOn(smsService, 'sendSms').mockResolvedValue({
            success: false,
            simulated: true,
            error: 'SMS service not configured',
        });

        const response = await request(app)
            .post('/api/sms-templates/send-to-contact')
            .set('Cookie', [`itemize_auth=${userA.token}`])
            .set('x-organization-id', String(userA.org.id))
            .send({ contact_id: contact.id, message: 'Hello' });

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
            success: false,
            code: 'SMS_PROVIDER_NOT_CONFIGURED',
        });
    });

    test('duplicate inbound delivery creates one message and one SMS log', async () => {
        const phone = '+16025550103';
        const receivingNumber = `+1602555${String(Date.now()).slice(-4)}`;
        const contact = (await dbHelper.pool.query(
            `INSERT INTO contacts (organization_id, first_name, phone, created_by)
             VALUES ($1, 'Lin', $2, $3) RETURNING id`,
            [userA.org.id, phone, userA.user.id]
        )).rows[0];
        await registerReceivingNumber(userA, receivingNumber);
        const sid = `IM${Date.now()}`;
        const payload = { MessageSid: sid, From: phone, To: receivingNumber, Body: 'Inbound hello' };

        const [first, second] = await Promise.all([
            request(app).post('/api/sms-templates/webhook/inbound').send(payload),
            request(app).post('/api/sms-templates/webhook/inbound').send(payload),
        ]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const [logs, messages, claims] = await Promise.all([
            dbHelper.pool.query('SELECT id FROM sms_logs WHERE external_id = $1', [sid]),
            dbHelper.pool.query('SELECT id FROM messages WHERE sender_contact_id = $1 AND content = $2', [contact.id, payload.Body]),
            dbHelper.pool.query(
                `SELECT event_key, organization_id, contact_id, processing_status
                 FROM sms_webhook_events WHERE external_id = $1`,
                [sid]
            ),
        ]);
        expect(logs.rows).toHaveLength(1);
        expect(messages.rows).toHaveLength(1);
        expect(claims.rows).toHaveLength(1);
        expect(claims.rows[0]).toMatchObject({
            organization_id: userA.org.id,
            contact_id: contact.id,
            processing_status: 'processed',
        });
    });

    test('the receiving number selects the tenant before matching a shared sender number', async () => {
        const phone = '+16025550104';
        const receivingNumber = `+1602556${String(Date.now()).slice(-4)}`;
        const [contactA] = await Promise.all([
            dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, phone, created_by)
                 VALUES ($1, 'A', $2, $3) RETURNING id`,
                [userA.org.id, phone, userA.user.id]
            ),
            dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, phone, created_by) VALUES ($1, 'B', $2, $3)`,
                [userB.org.id, phone, userB.user.id]
            ),
        ]);
        await registerReceivingNumber(userA, receivingNumber);
        const sid = `IM-owned-${Date.now()}`;

        const response = await request(app)
            .post('/api/sms-templates/webhook/inbound')
            .send({ MessageSid: sid, From: phone, To: receivingNumber, Body: 'Route by receiver' });

        expect(response.status).toBe(200);
        const logs = await dbHelper.pool.query(
            'SELECT organization_id, contact_id FROM sms_logs WHERE external_id = $1',
            [sid]
        );
        expect(logs.rows).toEqual([{
            organization_id: userA.org.id,
            contact_id: contactA.rows[0].id,
        }]);
    });

    test('an unknown receiving number is quarantined without tenant attribution', async () => {
        const sid = `IM-unmatched-receiver-${Date.now()}`;
        const response = await request(app)
            .post('/api/sms-templates/webhook/inbound')
            .send({
                MessageSid: sid,
                From: '+16025550106',
                To: '+16025559876',
                Body: 'Unknown receiver',
            });

        expect(response.status).toBe(200);
        const [claim, logs] = await Promise.all([
            dbHelper.pool.query(
                `SELECT organization_id, processing_status
                 FROM sms_webhook_events WHERE external_id = $1`,
                [sid]
            ),
            dbHelper.pool.query('SELECT id FROM sms_logs WHERE external_id = $1', [sid]),
        ]);
        expect(claim.rows).toEqual([{
            organization_id: null,
            processing_status: 'unmatched_receiver',
        }]);
        expect(logs.rows).toHaveLength(0);
    });

    test('duplicate sender records inside the receiving tenant are quarantined', async () => {
        const phone = '+16025550107';
        const receivingNumber = `+1602557${String(Date.now()).slice(-4)}`;
        await registerReceivingNumber(userA, receivingNumber);
        await Promise.all([
            dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, phone, created_by)
                 VALUES ($1, 'Duplicate A', $2, $3)`,
                [userA.org.id, phone, userA.user.id]
            ),
            dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, phone, created_by)
                 VALUES ($1, 'Duplicate B', $2, $3)`,
                [userA.org.id, phone, userA.user.id]
            ),
        ]);
        const sid = `IM-ambiguous-sender-${Date.now()}`;

        expect((await request(app)
            .post('/api/sms-templates/webhook/inbound')
            .send({
                MessageSid: sid,
                From: phone,
                To: receivingNumber,
                Body: 'Do not guess the contact',
            })).status).toBe(200);

        const claim = await dbHelper.pool.query(
            `SELECT organization_id, contact_id, processing_status
             FROM sms_webhook_events WHERE external_id = $1`,
            [sid]
        );
        expect(claim.rows).toEqual([{
            organization_id: userA.org.id,
            contact_id: null,
            processing_status: 'ambiguous_sender',
        }]);
    });

    test('status delivery is replay-safe and rejects unsupported states', async () => {
        const sid = `SM-status-${Date.now()}`;
        await dbHelper.pool.query(
            `INSERT INTO sms_logs (organization_id, to_phone, message, direction, status, external_id)
             VALUES ($1, '+16025550105', 'status', 'outbound', 'sent', $2)`,
            [userA.org.id, sid]
        );

        const first = await request(app)
            .post('/api/sms-templates/webhook/status')
            .send({ MessageSid: sid, MessageStatus: 'delivered' });
        const duplicate = await request(app)
            .post('/api/sms-templates/webhook/status')
            .send({ MessageSid: sid, MessageStatus: 'delivered' });
        const unsupported = await request(app)
            .post('/api/sms-templates/webhook/status')
            .send({ MessageSid: sid, MessageStatus: 'invented' });

        expect(first.status).toBe(200);
        expect(duplicate.text).toBe('Duplicate');
        expect(unsupported.status).toBe(400);
        const log = await dbHelper.pool.query('SELECT status, delivered_at FROM sms_logs WHERE external_id = $1', [sid]);
        expect(log.rows[0].status).toBe('delivered');
        expect(log.rows[0].delivered_at).not.toBeNull();
    });
});
