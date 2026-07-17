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

function campaignPayload(overrides = {}) {
    return {
        name: 'Summer Sale',
        subject: 'Big discounts this summer!',
        from_name: 'ACME Marketing',
        from_email: 'marketing@acme.com',
        content_html: '<h1>Summer Sale</h1><p>Check out our deals.</p>',
        segment_type: 'all',
        ...overrides,
    };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Campaigns Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`camp-a-${Date.now()}@test.itemize`, 'Campaign User A'),
            dbHelper.seedUser(`camp-b-${Date.now()}@test.itemize`, 'Campaign User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD ─────────────────────────────────────────────────────────────────

    describe('Campaign CRUD', () => {
        let campaignId;

        it('creates a campaign', async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload());

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const c = res.body.data;
            expect(c.name).toBe('Summer Sale');
            expect(c.subject).toBe('Big discounts this summer!');
            expect(c.status).toBe('draft');
            expect(c.organization_id).toBe(userA.org.id);
            campaignId = c.id;
        });

        it('rejects creation without name', async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: undefined }));

            expect(res.status).toBe(400);
        });

        it('rejects creation without subject', async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ subject: undefined }));

            expect(res.status).toBe(400);
        });

        it('lists campaigns for User A org', async () => {
            const res = await request(app)
                .get('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.some(c => c.id === campaignId)).toBe(true);
        });

        it('User B org cannot see User A campaigns', async () => {
            const res = await request(app)
                .get('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(c => c.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.some(c => c.id === campaignId)).toBe(false);
        });

        it('fetches a single campaign by ID with links array', async () => {
            const res = await request(app)
                .get(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            const c = res.body.data;
            expect(c.id).toBe(campaignId);
            expect(Array.isArray(c.links)).toBe(true);
        });

        it('User B cannot fetch User A campaign', async () => {
            const res = await request(app)
                .get(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates a draft campaign', async () => {
            const res = await request(app)
                .put(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Updated Sale', subject: 'Even bigger discounts!' });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated Sale');
            expect(res.body.data.subject).toBe('Even bigger discounts!');
        });

        it('User B cannot update User A campaign', async () => {
            const res = await request(app)
                .put(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a campaign', async () => {
            const res = await request(app)
                .delete(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/campaigns/${campaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Sent campaign restrictions ────────────────────────────────────────────

    describe('Edit/delete restrictions on sent campaigns', () => {
        let sentCampaignId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: 'Already Sent' }));
            sentCampaignId = res.body.data.id;

            // Force status to 'sent' directly in DB
            await dbHelper.pool.query(
                "UPDATE email_campaigns SET status = 'sent' WHERE id = $1",
                [sentCampaignId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM email_campaigns WHERE id = $1', [sentCampaignId]);
        });

        it('cannot edit a sent campaign', async () => {
            const res = await request(app)
                .put(`/api/campaigns/${sentCampaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Try Edit' });

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/sent/i);
        });

        it('can delete a sent campaign', async () => {
            const res = await request(app)
                .delete(`/api/campaigns/${sentCampaignId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            // Sent campaigns can be deleted (only 'sending' is blocked)
            expect(res.status).toBe(200);
        });
    });

    // ── Delete blocked when 'sending' ─────────────────────────────────────────

    describe('Delete blocked while campaign is sending', () => {
        let sendingId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: 'Sending Now' }));
            sendingId = res.body.data.id;

            await dbHelper.pool.query(
                "UPDATE email_campaigns SET status = 'sending' WHERE id = $1",
                [sendingId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM email_campaigns WHERE id = $1', [sendingId]);
        });

        it('blocks deletion while campaign is sending', async () => {
            const res = await request(app)
                .delete(`/api/campaigns/${sendingId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/sending/i);
        });
    });

    // ── Duplicate ─────────────────────────────────────────────────────────────

    describe('Duplicate campaign', () => {
        let sourceId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: 'Source Campaign' }));
            sourceId = res.body.data.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                "DELETE FROM email_campaigns WHERE organization_id = $1 AND name LIKE '%Source Campaign%'",
                [userA.org.id]
            );
        });

        it('duplicates a campaign as draft', async () => {
            const res = await request(app)
                .post(`/api/campaigns/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(201);
            const copy = res.body.data;
            expect(copy.name).toBe('Source Campaign (Copy)');
            expect(copy.status).toBe('draft');
            expect(copy.id).not.toBe(sourceId);
        });

        it('User B cannot duplicate User A campaign', async () => {
            const res = await request(app)
                .post(`/api/campaigns/${sourceId}/duplicate`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Schedule / Unschedule ─────────────────────────────────────────────────

    describe('Schedule and unschedule', () => {
        let campaignId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: 'Schedulable Campaign' }));
            campaignId = res.body.data.id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM email_campaigns WHERE id = $1', [campaignId]);
        });

        it('rejects schedule without scheduled_at', async () => {
            const res = await request(app)
                .post(`/api/campaigns/${campaignId}/schedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            expect(res.status).toBe(400);
        });

        it('rejects scheduling in the past', async () => {
            const past = new Date(Date.now() - 60000).toISOString();
            const res = await request(app)
                .post(`/api/campaigns/${campaignId}/schedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ scheduled_at: past });

            expect(res.status).toBe(400);
        });

        it('schedules a campaign for a future time', async () => {
            const future = new Date(Date.now() + 3600000).toISOString();
            const res = await request(app)
                .post(`/api/campaigns/${campaignId}/schedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ scheduled_at: future, timezone: 'America/New_York' });

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('scheduled');
            expect(res.body.data.scheduled_at).toBeTruthy();
        });

        it('unschedules a scheduled campaign back to draft', async () => {
            const res = await request(app)
                .post(`/api/campaigns/${campaignId}/unschedule`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('draft');
            expect(res.body.data.scheduled_at).toBeNull();
        });
    });

    // ── List filtering ────────────────────────────────────────────────────────

    describe('List filtering', () => {
        let draftId, scheduledId;

        beforeAll(async () => {
            const [r1, r2] = await Promise.all([
                request(app)
                    .post('/api/campaigns')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(campaignPayload({ name: 'Filter Draft' })),
                request(app)
                    .post('/api/campaigns')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(campaignPayload({ name: 'Filter Scheduled' })),
            ]);
            draftId = r1.body.data.id;
            scheduledId = r2.body.data.id;

            await dbHelper.pool.query(
                "UPDATE email_campaigns SET status = 'scheduled', scheduled_at = NOW() + INTERVAL '1 day' WHERE id = $1",
                [scheduledId]
            );
        });

        afterAll(async () => {
            await dbHelper.pool.query(
                'DELETE FROM email_campaigns WHERE id = ANY($1::int[])',
                [[draftId, scheduledId].filter(Boolean)]
            );
        });

        it('filters by status=draft', async () => {
            const res = await request(app)
                .get('/api/campaigns?status=draft')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(c => c.status === 'draft')).toBe(true);
            expect(res.body.data.some(c => c.id === draftId)).toBe(true);
        });

        it('filters by status=scheduled', async () => {
            const res = await request(app)
                .get('/api/campaigns?status=scheduled')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(c => c.status === 'scheduled')).toBe(true);
        });

        it('filters by name search', async () => {
            const res = await request(app)
                .get('/api/campaigns?search=Filter+Draft')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.some(c => c.id === draftId)).toBe(true);
        });
    });

    describe('Canonical email audience identity', () => {
        it('previews and snapshots one recipient per canonical email', async () => {
            const suffix = `${Date.now()}-${process.pid}`;
            const email = `campaign-duplicate-${suffix}@example.test`;
            const contacts = await dbHelper.pool.query(
                `INSERT INTO contacts (
                    organization_id, first_name, email, source, created_by
                 ) VALUES
                    ($1, 'Campaign Canonical', $2, 'manual', $3),
                    ($1, 'Campaign Duplicate', $2, 'manual', $3)
                 RETURNING id`,
                [userA.org.id, email, userA.user.id]
            );
            const campaign = await request(app)
                .post('/api/campaigns')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(campaignPayload({ name: `Canonical Audience ${suffix}` }));
            expect(campaign.status).toBe(201);
            await dbHelper.pool.query(
                `INSERT INTO subscriptions (organization_id, plan_id, status)
                 SELECT $1, id, 'trialing'
                 FROM subscription_plans
                 WHERE name = 'starter'
                 ON CONFLICT (organization_id) DO UPDATE SET
                    plan_id = EXCLUDED.plan_id,
                    status = EXCLUDED.status`,
                [userA.org.id]
            );

            const preview = await request(app)
                .get(`/api/campaigns/${campaign.body.data.id}/preview`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(preview.status).toBe(200);

            const rawEligible = await dbHelper.pool.query(
                `SELECT COUNT(*)::int AS count,
                        COUNT(DISTINCT email)::int AS distinct_count
                 FROM contacts
                 WHERE organization_id = $1
                   AND email IS NOT NULL
                   AND COALESCE(email_unsubscribed, false) = false
                   AND COALESCE(email_bounced, false) = false`,
                [userA.org.id]
            );
            expect(rawEligible.rows[0].count).toBeGreaterThan(rawEligible.rows[0].distinct_count);
            expect(preview.body.data.recipientCount).toBe(rawEligible.rows[0].distinct_count);

            const sent = await request(app)
                .post(`/api/campaigns/${campaign.body.data.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});
            expect(sent.status).toBe(200);
            expect(sent.body.data.recipientCount).toBe(rawEligible.rows[0].distinct_count);

            const snapshot = await dbHelper.pool.query(
                `SELECT contact_id, email
                 FROM campaign_recipients
                 WHERE campaign_id = $1 AND email = $2`,
                [campaign.body.data.id, email]
            );
            expect(snapshot.rows).toEqual([{
                contact_id: Math.min(...contacts.rows.map(row => row.id)),
                email,
            }]);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/campaigns');
            expect(res.status).toBe(401);
        });
    });
});
