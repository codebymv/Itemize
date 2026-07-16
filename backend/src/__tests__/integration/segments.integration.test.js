jest.mock('../../services/usageTrackingService', () => class UsageTrackingService {
    async isWithinLimits() {
        return { withinLimits: true };
    }

    async incrementUsage() {}
});

jest.mock('../../routes/campaigns/delivery', () => ({
    sendCampaignEmails: jest.fn().mockResolvedValue(undefined),
}));

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

const segmentPayload = (overrides = {}) => ({
    name: 'Active contacts',
    description: 'Reusable audience',
    segment_type: 'dynamic',
    filter_type: 'and',
    filters: [{ field: 'status', operator: 'equals', value: 'active' }],
    ...overrides,
});

describe('Segments integration', () => {
    let dbHelper;
    let app;
    let userA;
    let userB;
    let activeContact;
    let inactiveContact;
    let _unsubscribedContact;
    let otherOrgContact;
    let dynamicSegment;
    let staticSegment;

    const auth = user => ({
        Cookie: `itemize_auth=${user.token}`,
        'x-organization-id': String(user.org.id),
    });

    const send = (method, path, user = userA) => request(app)[method](path).set(auth(user));

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`segments-a-${Date.now()}@test.itemize`, 'Segments User A'),
            dbHelper.seedUser(`segments-b-${Date.now()}@test.itemize`, 'Segments User B'),
        ]);

        const insertContact = async (organizationId, values) => (await dbHelper.pool.query(`
            INSERT INTO contacts (
                organization_id, first_name, last_name, email, status, source,
                custom_fields, email_unsubscribed, email_bounced, created_by
            ) VALUES ($1, $2, $3, $4, $5, 'manual', $6::jsonb, $7, FALSE, $8)
            RETURNING *
        `, [
            organizationId, values.firstName, 'Tester', values.email, values.status,
            JSON.stringify(values.customFields || {}), values.unsubscribed || false,
            organizationId === userA.org.id ? userA.user.id : userB.user.id,
        ])).rows[0];

        [activeContact, inactiveContact, _unsubscribedContact, otherOrgContact] = await Promise.all([
            insertContact(userA.org.id, {
                firstName: 'Active', email: 'active@segments.test', status: 'active', customFields: { tier: 'gold' },
            }),
            insertContact(userA.org.id, {
                firstName: 'Inactive', email: 'inactive@segments.test', status: 'inactive', customFields: { tier: 'silver' },
            }),
            insertContact(userA.org.id, {
                firstName: 'Unsubscribed', email: 'unsubscribed@segments.test', status: 'active', unsubscribed: true,
            }),
            insertContact(userB.org.id, {
                firstName: 'Other', email: 'other@segments.test', status: 'active', customFields: { tier: 'gold' },
            }),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper?.teardown(); }, 30000);

    test('literal filter-options route is reachable and advertises valid contact statuses', async () => {
        const response = await send('get', '/api/segments/filter-options');
        expect(response.status).toBe(200);
        const statusField = response.body.fields.find(field => field.id === 'status');
        expect(statusField.options).toEqual(['active', 'inactive', 'archived']);
    });

    test('preview binds filters correctly and stays inside the selected organization', async () => {
        const response = await send('post', '/api/segments/preview').send({
            filter_type: 'and',
            filters: [{ field: 'custom_field', operator: 'equals', custom_field_key: 'tier', value: 'gold' }],
        });
        expect(response.status).toBe(200);
        expect(response.body.count).toBe(1);
        expect(response.body.sample.map(contact => contact.id)).toEqual([activeContact.id]);
    });

    test.each([
        [{ field: 'not_a_field', operator: 'equals', value: 'x' }, 'field'],
        [{ field: 'status', operator: 'contains', value: 'active' }, 'operator'],
        [{ field: 'last_activity', operator: 'last_n_days', value: -1 }, 'value'],
    ])('invalid rules fail closed instead of matching every contact', async (filter, expectedField) => {
        const response = await send('post', '/api/segments/preview').send({ filter_type: 'and', filters: [filter] });
        expect(response.status).toBe(400);
        expect(response.body.field).toContain(expectedField);
    });

    test('custom-field keys are query parameters rather than executable SQL', async () => {
        const response = await send('post', '/api/segments/preview').send({
            filter_type: 'and',
            filters: [{
                field: 'custom_field', operator: 'equals',
                custom_field_key: "tier') OR TRUE --", value: 'gold',
            }],
        });
        expect(response.status).toBe(200);
        expect(response.body.count).toBe(0);
        expect((await dbHelper.pool.query('SELECT COUNT(*)::int AS total FROM contacts')).rows[0].total).toBeGreaterThan(0);
    });

    test('dynamic CRUD calculates membership and serves bounded pagination', async () => {
        const created = await send('post', '/api/segments').send(segmentPayload());
        expect(created.status).toBe(201);
        expect(created.body.contact_count).toBe(2);
        dynamicSegment = created.body;

        const contacts = await send('get', `/api/segments/${dynamicSegment.id}/contacts?limit=1&page=1`);
        expect(contacts.status).toBe(200);
        expect(contacts.body.contacts).toHaveLength(1);
        expect(contacts.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });

        const invalidPagination = await send('get', `/api/segments/${dynamicSegment.id}/contacts?limit=101`);
        expect(invalidPagination.status).toBe(400);
        expect(invalidPagination.body.field).toBe('limit');
    });

    test('static segments need no filters and reject contacts owned by another organization', async () => {
        const created = await send('post', '/api/segments').send(segmentPayload({
            name: 'Hand-picked contacts',
            segment_type: 'static',
            filters: undefined,
            static_contact_ids: [activeContact.id, inactiveContact.id],
        }));
        expect(created.status).toBe(201);
        expect(created.body.contact_count).toBe(2);
        staticSegment = created.body;

        const contacts = await send('get', `/api/segments/${staticSegment.id}/contacts`);
        expect(contacts.body.contacts.map(contact => contact.id).sort((a, b) => a - b))
            .toEqual([activeContact.id, inactiveContact.id].sort((a, b) => a - b));

        const rejected = await send('post', '/api/segments').send(segmentPayload({
            name: 'Cross-tenant static segment',
            segment_type: 'static',
            filters: undefined,
            static_contact_ids: [otherOrgContact.id],
        }));
        expect(rejected.status).toBe(400);
        expect(rejected.body.field).toBe('static_contact_ids');
    });

    test('partial updates preserve metadata and invalid updates roll back', async () => {
        const updated = await send('put', `/api/segments/${dynamicSegment.id}`).send({ name: 'Renamed audience' });
        expect(updated.status).toBe(200);
        expect(updated.body.description).toBe('Reusable audience');

        const rejected = await send('put', `/api/segments/${dynamicSegment.id}`).send({
            filters: [{ field: 'status', operator: 'equals', value: 'lead' }],
        });
        expect(rejected.status).toBe(400);

        const fetched = await send('get', `/api/segments/${dynamicSegment.id}`);
        expect(fetched.body.name).toBe('Renamed audience');
        expect(fetched.body.filters).toEqual([{ field: 'status', operator: 'equals', value: 'active' }]);
    });

    test('concurrent recalculations serialize history deltas', async () => {
        await dbHelper.pool.query('UPDATE segments SET contact_count = 0 WHERE id = $1', [dynamicSegment.id]);
        const [first, second] = await Promise.all([
            send('post', `/api/segments/${dynamicSegment.id}/calculate`),
            send('post', `/api/segments/${dynamicSegment.id}/calculate`),
        ]);
        expect([first.status, second.status]).toEqual([200, 200]);

        const history = await dbHelper.pool.query(`
            SELECT contacts_added, contacts_removed FROM segment_history
            WHERE segment_id = $1 ORDER BY id DESC LIMIT 2
        `, [dynamicSegment.id]);
        expect(history.rows.map(row => Number(row.contacts_added)).sort((a, b) => a - b)).toEqual([0, 2]);
        expect(history.rows.every(row => Number(row.contacts_removed) === 0)).toBe(true);
    });

    test('campaign preview, send snapshot, and duplicate preserve saved-segment targeting', async () => {
        const created = await send('post', '/api/campaigns').send({
            name: 'Saved audience campaign', subject: 'Audience contract',
            from_name: 'Itemize', from_email: 'hello@itemize.test', content_html: '<p>Hello</p>',
            segment_type: 'segment', segment_id: dynamicSegment.id,
        });
        expect(created.status).toBe(201);
        expect(created.body.data.segment_id).toBe(dynamicSegment.id);
        const campaignId = created.body.data.id;

        const preview = await send('get', `/api/campaigns/${campaignId}/preview`);
        expect(preview.status).toBe(200);
        expect(preview.body.data).toMatchObject({ recipientCount: 1, segmentType: 'segment', segmentId: dynamicSegment.id });

        const sent = await send('post', `/api/campaigns/${campaignId}/send`);
        expect(sent.status).toBe(200);
        expect(sent.body.data.recipientCount).toBe(1);
        const recipients = await dbHelper.pool.query(
            'SELECT contact_id FROM campaign_recipients WHERE campaign_id = $1',
            [campaignId]
        );
        expect(recipients.rows.map(row => row.contact_id)).toEqual([activeContact.id]);

        const duplicate = await send('post', `/api/campaigns/${campaignId}/duplicate`);
        expect(duplicate.status).toBe(201);
        expect(duplicate.body.data.segment_id).toBe(dynamicSegment.id);

        const deleteSegment = await send('delete', `/api/segments/${dynamicSegment.id}`);
        expect(deleteSegment.status).toBe(409);

        await dbHelper.pool.query(
            "UPDATE email_campaigns SET status = 'sent' WHERE segment_id = $1",
            [dynamicSegment.id]
        );
        const deleteHistoricallyReferencedSegment = await send('delete', `/api/segments/${dynamicSegment.id}`);
        expect(deleteHistoricallyReferencedSegment.status).toBe(409);
    });

    test('campaigns reject saved segments from another organization', async () => {
        const response = await send('post', '/api/campaigns', userB).send({
            name: 'Cross-tenant campaign', subject: 'Must reject',
            segment_type: 'segment', segment_id: staticSegment.id,
        });
        expect(response.status).toBe(400);
        expect(response.body.error.field).toBe('segment_id');
    });
});
