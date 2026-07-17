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

    const { router: authRouter } = require('../../auth');
    app.use('/api/auth', authRouter);

    const noop = (_req, _res, next) => next();
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool,
        authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Organizations Integration Tests', () => {
    let dbHelper;
    let app;
    let owner, admin, member, outsider;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [owner, admin, member, outsider] = await Promise.all([
            dbHelper.seedUser(`org-owner-${Date.now()}@test.itemize`, 'Org Owner'),
            dbHelper.seedUser(`org-admin-${Date.now()}@test.itemize`, 'Org Admin'),
            dbHelper.seedUser(`org-member-${Date.now()}@test.itemize`, 'Org Member'),
            dbHelper.seedUser(`org-outsider-${Date.now()}@test.itemize`, 'Org Outsider'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    // ── Listing ───────────────────────────────────────────────────────────────

    describe('GET /api/organizations', () => {
        it('returns the organizations the owner belongs to', async () => {
            const res = await request(app)
                .get('/api/organizations')
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.some(o => o.id === owner.org.id)).toBe(true);
        });

        it('returns 401 without auth', async () => {
            const res = await request(app).get('/api/organizations');
            expect(res.status).toBe(401);
        });
    });

    // ── CRUD ──────────────────────────────────────────────────────────────────

    describe('Create and read an organization', () => {
        let createdOrgId;

        it('creates a new organization and sets creator as owner', async () => {
            const res = await request(app)
                .post('/api/organizations')
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ name: 'Test Corp' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.name).toBe('Test Corp');
            expect(res.body.data.role).toBe('owner');
            createdOrgId = res.body.data.id;
        });

        it('rejects creation with a blank name', async () => {
            const res = await request(app)
                .post('/api/organizations')
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ name: '   ' });

            expect(res.status).toBe(400);
        });

        it('fetches the newly created org by ID', async () => {
            const res = await request(app)
                .get(`/api/organizations/${createdOrgId}`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(createdOrgId);
            expect(res.body.data.role).toBe('owner');
        });

        it('outsider cannot fetch the org', async () => {
            const res = await request(app)
                .get(`/api/organizations/${createdOrgId}`)
                .set('Cookie', [`itemize_auth=${outsider.token}`]);

            expect(res.status).toBe(403);
        });

        it('rejects a malformed organization ID as bad input', async () => {
            const res = await request(app)
                .get('/api/organizations/not-an-id')
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(400);
        });

        it('owner can update the org name', async () => {
            const res = await request(app)
                .put(`/api/organizations/${createdOrgId}`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ name: 'Renamed Corp' });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Renamed Corp');
        });

        it('outsider cannot update the org', async () => {
            const res = await request(app)
                .put(`/api/organizations/${createdOrgId}`)
                .set('Cookie', [`itemize_auth=${outsider.token}`])
                .send({ name: 'Hacked' });

            expect(res.status).toBe(403);
        });

        // Clean up the extra org so it doesn't leak into member tests
        afterAll(async () => {
            if (createdOrgId) {
                await dbHelper.pool.query('DELETE FROM organizations WHERE id = $1', [createdOrgId]);
            }
        });
    });

    // ── Member management ─────────────────────────────────────────────────────

    describe('Member management', () => {
        // We use the personal org seeded for `owner`
        let sharedOrgId;
        let adminMemberId;
        let memberMemberId;

        beforeAll(async () => {
            sharedOrgId = owner.org.id;
        });

        it('owner can invite admin user by email', async () => {
            const res = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: admin.user.email, role: 'admin' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            adminMemberId = res.body.data.id;
        });

        it('owner can invite a regular member', async () => {
            const res = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: member.user.email, role: 'member' });

            expect(res.status).toBe(201);
            memberMemberId = res.body.data.id;
        });

        it('cannot invite the same user twice', async () => {
            const res = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: admin.user.email, role: 'member' });

            expect(res.status).toBe(400);
        });

        it('returns 404 when inviting a non-existent email', async () => {
            const res = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: 'ghost@no-such-user.test', role: 'member' });

            expect(res.status).toBe(404);
        });

        it('outsider cannot invite members', async () => {
            const res = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${outsider.token}`])
                .send({ email: outsider.user.email, role: 'member' });

            expect(res.status).toBe(403);
        });

        it('lists all members of the org', async () => {
            const res = await request(app)
                .get(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
            const members = res.body.data;
            expect(members.some(m => m.id === adminMemberId)).toBe(true);
            expect(members.some(m => m.id === memberMemberId)).toBe(true);
        });

        it('owner can change a member role', async () => {
            const res = await request(app)
                .put(`/api/organizations/${sharedOrgId}/members/${memberMemberId}`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ role: 'viewer' });

            expect(res.status).toBe(200);
            expect(res.body.data.role).toBe('viewer');
        });

        it('cannot change role to an invalid value', async () => {
            const res = await request(app)
                .put(`/api/organizations/${sharedOrgId}/members/${memberMemberId}`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ role: 'superadmin' });

            expect(res.status).toBe(400);
        });

        it('rejects a malformed member ID as bad input', async () => {
            const res = await request(app)
                .put(`/api/organizations/${sharedOrgId}/members/not-an-id`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ role: 'viewer' });

            expect(res.status).toBe(400);
        });

        it('cannot change the owner role via member update', async () => {
            // Get the owner's membership record
            const membersRes = await request(app)
                .get(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            const ownerMemberRecord = membersRes.body.data.find(
                m => m.user_id === owner.user.id
            );

            const res = await request(app)
                .put(`/api/organizations/${sharedOrgId}/members/${ownerMemberRecord.id}`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ role: 'member' });

            expect(res.status).toBe(403);
        });

        it('admin cannot modify another admin', async () => {
            // Add a second admin for the test
            const secondAdmin = await dbHelper.seedUser(
                `org-admin2-${Date.now()}@test.itemize`, 'Second Admin'
            );
            const inviteRes = await request(app)
                .post(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: secondAdmin.user.email, role: 'admin' });
            const secondAdminMemberId = inviteRes.body.data.id;

            const res = await request(app)
                .put(`/api/organizations/${sharedOrgId}/members/${secondAdminMemberId}`)
                .set('Cookie', [`itemize_auth=${admin.token}`])
                .send({ role: 'member' });

            expect(res.status).toBe(403);
        });

        it('owner can remove a member', async () => {
            const res = await request(app)
                .delete(`/api/organizations/${sharedOrgId}/members/${memberMemberId}`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
        });

        it('cannot remove the owner via member delete', async () => {
            const membersRes = await request(app)
                .get(`/api/organizations/${sharedOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            const ownerMemberRecord = membersRes.body.data.find(
                m => m.user_id === owner.user.id
            );

            const res = await request(app)
                .delete(`/api/organizations/${sharedOrgId}/members/${ownerMemberRecord.id}`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(403);
        });
    });

    // ── Leave org ─────────────────────────────────────────────────────────────

    describe('Leave organization', () => {
        let leaveOrgId;

        beforeAll(async () => {
            // Create a fresh org and add a member who will leave
            const createRes = await request(app)
                .post('/api/organizations')
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ name: 'Leave Test Org' });
            leaveOrgId = createRes.body.data.id;

            const inviteRes = await request(app)
                .post(`/api/organizations/${leaveOrgId}/members`)
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ email: member.user.email, role: 'member' });
            expect(inviteRes.status).toBe(201);
        });

        afterAll(async () => {
            if (leaveOrgId) {
                await dbHelper.pool.query('DELETE FROM organizations WHERE id = $1', [leaveOrgId]);
            }
        });

        it('a member can leave an org', async () => {
            const selectRes = await request(app)
                .post(`/api/organizations/${leaveOrgId}/select`)
                .set('Cookie', [`itemize_auth=${member.token}`]);
            expect(selectRes.status).toBe(200);

            const res = await request(app)
                .post(`/api/organizations/${leaveOrgId}/leave`)
                .set('Cookie', [`itemize_auth=${member.token}`]);

            expect(res.status).toBe(200);
            const userResult = await dbHelper.pool.query(
                'SELECT default_organization_id FROM users WHERE id = $1',
                [member.user.id]
            );
            expect(userResult.rows[0].default_organization_id).toBe(member.org.id);
        });

        it('the owner cannot leave their own org', async () => {
            const res = await request(app)
                .post(`/api/organizations/${leaveOrgId}/leave`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(403);
        });
    });

    // ── ensure-default ────────────────────────────────────────────────────────

    describe('POST /api/organizations/ensure-default', () => {
        it('returns an existing org if the user already has one', async () => {
            const res = await request(app)
                .post('/api/organizations/ensure-default')
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBeTruthy();
        });

        it('persists and returns the explicitly selected organization', async () => {
            const createRes = await request(app)
                .post('/api/organizations')
                .set('Cookie', [`itemize_auth=${owner.token}`])
                .send({ name: 'Selected Workspace' });
            const selectedId = createRes.body.data.id;

            try {
                const selectRes = await request(app)
                    .post(`/api/organizations/${selectedId}/select`)
                    .set('Cookie', [`itemize_auth=${owner.token}`]);

                expect(selectRes.status).toBe(200);
                expect(selectRes.body.data).toMatchObject({
                    id: selectedId,
                    role: 'owner',
                    is_default: true,
                });

                const ensureRes = await request(app)
                    .post('/api/organizations/ensure-default')
                    .set('Cookie', [`itemize_auth=${owner.token}`]);
                expect(ensureRes.status).toBe(200);
                expect(ensureRes.body.data.id).toBe(selectedId);

                const listRes = await request(app)
                    .get('/api/organizations')
                    .set('Cookie', [`itemize_auth=${owner.token}`]);
                expect(listRes.body.data.find(org => org.id === selectedId).is_default).toBe(true);
                expect(listRes.body.data.find(org => org.id === owner.org.id).is_default).toBe(false);
            } finally {
                await dbHelper.pool.query('DELETE FROM organizations WHERE id = $1', [selectedId]);
                await dbHelper.pool.query(
                    'UPDATE users SET default_organization_id = $1 WHERE id = $2',
                    [owner.org.id, owner.user.id]
                );
            }
        });

        it('rejects selecting an organization without membership', async () => {
            const res = await request(app)
                .post(`/api/organizations/${outsider.org.id}/select`)
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(403);
        });

        it('repairs a default that no longer belongs to the user', async () => {
            await dbHelper.pool.query(
                'UPDATE users SET default_organization_id = $1 WHERE id = $2',
                [outsider.org.id, owner.user.id]
            );

            const res = await request(app)
                .post('/api/organizations/ensure-default')
                .set('Cookie', [`itemize_auth=${owner.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(owner.org.id);
            const userResult = await dbHelper.pool.query(
                'SELECT default_organization_id FROM users WHERE id = $1',
                [owner.user.id]
            );
            expect(userResult.rows[0].default_organization_id).toBe(owner.org.id);
        });
    });
});
