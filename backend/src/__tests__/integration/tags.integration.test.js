const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const { compileCampaignAudience } = require('../../services/campaignAudience');
const { compileSegmentCondition } = require('../../services/segmentFilter');
const { runCanonicalTagModelMigration } = require('../../db_tag_canonical_migrations');

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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Tags Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`tag-a-${Date.now()}@test.itemize`, 'Tag User A'),
            dbHelper.seedUser(`tag-b-${Date.now()}@test.itemize`, 'Tag User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD & multi-tenant isolation ─────────────────────────────────────────

    describe('Tag CRUD', () => {
        let tagId;

        it('creates a tag in User A org', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'VIP', color: '#F59E0B' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const tag = res.body.data;
            expect(tag.name).toBe('VIP');
            expect(tag.color).toBe('#F59E0B');
            expect(tag.organization_id).toBe(userA.org.id);
            tagId = tag.id;
        });

        it('rejects creating a tag without a name', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ color: '#F59E0B' });

            expect(res.status).toBe(400);
        });

        it('rejects a duplicate tag name (case-insensitive)', async () => {
            const res = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'vip' }); // same as 'VIP', different case

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/already exists/i);
        });

        it('lists tags for User A org', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.some(t => t.id === tagId)).toBe(true);
        });

        it('User B org cannot see User A tags', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(t => t.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.some(t => t.id === tagId)).toBe(false);
        });

        it('tags list includes contact_count', async () => {
            const res = await request(app)
                .get('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            const vip = res.body.data.find(t => t.id === tagId);
            expect(vip).toBeTruthy();
            expect(typeof vip.contact_count).toBe('number');
        });

        it('updates a tag name and color', async () => {
            const res = await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: 'Premium', color: '#10B981' });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Premium');
            expect(res.body.data.color).toBe('#10B981');
        });

        it('rejects renaming a tag to another case-insensitive organization name', async () => {
            const other = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `Existing-${Date.now()}` });

            const res = await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: other.body.data.name.toLowerCase() });

            expect(res.status).toBe(400);

            await request(app)
                .delete(`/api/tags/${other.body.data.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });

        it('User B cannot update User A tag', async () => {
            const res = await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ name: 'Hacked' });

            expect(res.status).toBe(404);
        });

        it('deletes a tag', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });

        it('User B cannot delete User A tag', async () => {
            const createRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `DeleteTarget-${Date.now()}` });
            const freshId = createRes.body.data.id;

            const delRes = await request(app)
                .delete(`/api/tags/${freshId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));
            expect(delRes.status).toBe(404);

            // Cleanup
            await request(app)
                .delete(`/api/tags/${freshId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    describe('Tag creation concurrency', () => {
        it('creates only one case-insensitive tag when requests race', async () => {
            const name = `RaceTag-${Date.now()}`;
            const create = value => request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: value });

            const responses = await Promise.all([create(name), create(name.toLowerCase())]);
            expect(responses.map(response => response.status).sort()).toEqual([201, 400]);

            const count = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM tags WHERE organization_id = $1 AND LOWER(name) = LOWER($2)',
                [userA.org.id, name]
            );
            expect(count.rows[0].count).toBe(1);
        });
    });

    describe('Canonical tag identity and membership', () => {
        let contactId;
        let dealId;
        let sharedTagId;
        let sharedTagName;

        beforeAll(async () => {
            sharedTagName = `Canonical-${Date.now()}`;
            const contact = (await dbHelper.pool.query(
                `INSERT INTO contacts (
                    organization_id, first_name, email, tags, created_by
                 ) VALUES ($1, 'Canonical Contact', $2, $3, $4)
                 RETURNING id, tags`,
                [
                    userA.org.id,
                    `canonical-${Date.now()}@test.itemize`,
                    [` ${sharedTagName} `, sharedTagName.toLowerCase(), '', 'ContactOnly'],
                    userA.user.id,
                ]
            )).rows[0];
            contactId = contact.id;

            const pipeline = (await dbHelper.pool.query(
                `INSERT INTO pipelines (
                    organization_id, name, stages, is_default, created_by
                 ) VALUES ($1, $2, $3::jsonb, false, $4)
                 RETURNING id`,
                [
                    userA.org.id,
                    `Canonical Pipeline ${Date.now()}`,
                    JSON.stringify([{ id: 'lead', name: 'Lead' }]),
                    userA.user.id,
                ]
            )).rows[0];
            const deal = (await dbHelper.pool.query(
                `INSERT INTO deals (
                    organization_id, pipeline_id, contact_id, stage_id,
                    title, tags, created_by
                 ) VALUES ($1, $2, $3, 'lead', $4, $5, $6)
                 RETURNING id, tags`,
                [
                    userA.org.id,
                    pipeline.id,
                    contactId,
                    `Canonical Deal ${Date.now()}`,
                    [sharedTagName.toLowerCase(), 'DealOnly'],
                    userA.user.id,
                ]
            )).rows[0];
            dealId = deal.id;

            sharedTagId = Number((await dbHelper.pool.query(
                `SELECT id FROM tags
                 WHERE organization_id = $1
                   AND lower(name) = lower($2)`,
                [userA.org.id, sharedTagName]
            )).rows[0].id);
        });

        it('normalizes legacy array writes into canonical rows and junction IDs', async () => {
            const contact = (await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            )).rows[0];
            const deal = (await dbHelper.pool.query(
                'SELECT tags FROM deals WHERE id = $1',
                [dealId]
            )).rows[0];
            expect(contact.tags).toEqual([sharedTagName, 'ContactOnly']);
            expect(deal.tags).toEqual([sharedTagName, 'DealOnly']);

            const tagRows = await dbHelper.pool.query(
                `SELECT id, name FROM tags
                 WHERE organization_id = $1
                   AND lower(name) = ANY($2::text[])
                 ORDER BY lower(name)`,
                [userA.org.id, [sharedTagName.toLowerCase(), 'contactonly', 'dealonly']]
            );
            expect(tagRows.rows).toHaveLength(3);

            const memberships = await dbHelper.pool.query(
                `SELECT
                    EXISTS (
                        SELECT 1 FROM contact_tags
                        WHERE contact_id = $1 AND tag_id = $3
                    ) AS contact_member,
                    EXISTS (
                        SELECT 1 FROM deal_tags
                        WHERE deal_id = $2 AND tag_id = $3
                    ) AS deal_member`,
                [contactId, dealId, sharedTagId]
            );
            expect(memberships.rows[0]).toEqual({
                contact_member: true,
                deal_member: true,
            });
        });

        it('makes array-origin membership visible to campaign and segment evaluators', async () => {
            const audience = compileCampaignAudience({
                segment_type: 'tag',
                tag_ids: [sharedTagId],
                excluded_tag_ids: [],
            }, { alias: 'c', startIndex: 2 });
            const audienceRows = await dbHelper.pool.query(
                `SELECT c.id
                 FROM contacts c
                 WHERE c.organization_id = $1 AND ${audience.condition}`,
                [userA.org.id, ...audience.params]
            );
            expect(audienceRows.rows.map(row => row.id)).toContain(contactId);

            const segment = compileSegmentCondition({
                segment_type: 'dynamic',
                filter_type: 'and',
                filters: [{
                    field: 'tags',
                    operator: 'has_any',
                    value: [sharedTagId],
                }],
            }, { alias: 'c', startIndex: 2 });
            const segmentRows = await dbHelper.pool.query(
                `SELECT c.id
                 FROM contacts c
                 WHERE c.organization_id = $1 AND ${segment.condition}`,
                [userA.org.id, ...segment.params]
            );
            expect(segmentRows.rows.map(row => row.id)).toContain(contactId);
        });

        it('projects direct junction changes and rejects cross-tenant membership', async () => {
            const directName = `Direct-${Date.now()}`;
            const directTag = (await dbHelper.pool.query(
                `INSERT INTO tags (organization_id, name)
                 VALUES ($1, $2)
                 RETURNING id`,
                [userA.org.id, directName]
            )).rows[0];

            await dbHelper.pool.query(
                `INSERT INTO contact_tags (contact_id, tag_id)
                 VALUES ($1, $2)`,
                [contactId, directTag.id]
            );
            let contact = (await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            )).rows[0];
            expect(contact.tags).toContain(directName);

            await dbHelper.pool.query(
                'DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2',
                [contactId, directTag.id]
            );
            contact = (await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            )).rows[0];
            expect(contact.tags).not.toContain(directName);

            const foreignContact = (await dbHelper.pool.query(
                `INSERT INTO contacts (
                    organization_id, first_name, email, created_by
                 ) VALUES ($1, 'Foreign Contact', $2, $3)
                 RETURNING id`,
                [
                    userB.org.id,
                    `foreign-tag-${Date.now()}@test.itemize`,
                    userB.user.id,
                ]
            )).rows[0];
            await expect(dbHelper.pool.query(
                `INSERT INTO contact_tags (contact_id, tag_id)
                 VALUES ($1, $2)`,
                [foreignContact.id, directTag.id]
            )).rejects.toMatchObject({ code: '23514' });

            const sameNameOtherTenant = (await dbHelper.pool.query(
                `INSERT INTO tags (organization_id, name)
                 VALUES ($1, $2)
                 RETURNING id`,
                [userB.org.id, directName.toLowerCase()]
            )).rows[0];
            expect(Number(sameNameOtherTenant.id)).not.toBe(Number(directTag.id));
        });

        it('keeps tag IDs stable on rename and removes all membership on delete', async () => {
            const renamed = `Renamed-${Date.now()}`;
            const update = await request(app)
                .put(`/api/tags/${sharedTagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: renamed });
            expect(update.status).toBe(200);
            expect(update.body.data.id).toBe(sharedTagId);

            const projections = await dbHelper.pool.query(
                `SELECT
                    (SELECT tags FROM contacts WHERE id = $1) AS contact_tags,
                    (SELECT tags FROM deals WHERE id = $2) AS deal_tags,
                    EXISTS (
                        SELECT 1 FROM contact_tags
                        WHERE contact_id = $1 AND tag_id = $3
                    ) AS contact_member,
                    EXISTS (
                        SELECT 1 FROM deal_tags
                        WHERE deal_id = $2 AND tag_id = $3
                    ) AS deal_member`,
                [contactId, dealId, sharedTagId]
            );
            expect(projections.rows[0].contact_tags).toContain(renamed);
            expect(projections.rows[0].deal_tags).toContain(renamed);
            expect(projections.rows[0].contact_member).toBe(true);
            expect(projections.rows[0].deal_member).toBe(true);

            const deleted = await request(app)
                .delete(`/api/tags/${sharedTagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
            expect(deleted.status).toBe(200);

            const afterDelete = await dbHelper.pool.query(
                `SELECT
                    (SELECT tags FROM contacts WHERE id = $1) AS contact_tags,
                    (SELECT tags FROM deals WHERE id = $2) AS deal_tags,
                    EXISTS (
                        SELECT 1 FROM contact_tags WHERE tag_id = $3
                    ) AS has_contact_membership,
                    EXISTS (
                        SELECT 1 FROM deal_tags WHERE tag_id = $3
                    ) AS has_deal_membership`,
                [contactId, dealId, sharedTagId]
            );
            expect(afterDelete.rows[0].contact_tags).not.toContain(renamed);
            expect(afterDelete.rows[0].deal_tags).not.toContain(renamed);
            expect(afterDelete.rows[0].has_contact_membership).toBe(false);
            expect(afterDelete.rows[0].has_deal_membership).toBe(false);
        });

        it('enforces normalized uniqueness in PostgreSQL without route locking', async () => {
            const name = `DatabaseUnique-${Date.now()}`;
            await dbHelper.pool.query(
                'INSERT INTO tags (organization_id, name) VALUES ($1, $2)',
                [userA.org.id, name]
            );
            await expect(dbHelper.pool.query(
                'INSERT INTO tags (organization_id, name) VALUES ($1, $2)',
                [userA.org.id, ` ${name.toLowerCase()} `]
            )).rejects.toMatchObject({ code: '23505' });
        });
    });

    describe('Canonical tag migration repair', () => {
        it('merges case drift and preserves array-only plus junction-only membership', async () => {
            const suffix = Date.now();
            const rowName = `LegacyDrift-${suffix}`;
            const arrayOnlyName = `ArrayOnly-${suffix}`;

            await dbHelper.pool.query(
                'ALTER TABLE contacts DISABLE TRIGGER contacts_prepare_canonical_tags'
            );
            await dbHelper.pool.query(
                'ALTER TABLE contacts DISABLE TRIGGER contacts_sync_canonical_tags'
            );
            await dbHelper.pool.query('ALTER TABLE deals DISABLE TRIGGER USER');
            await dbHelper.pool.query('ALTER TABLE tags DISABLE TRIGGER USER');
            await dbHelper.pool.query('ALTER TABLE contact_tags DISABLE TRIGGER USER');
            await dbHelper.pool.query('ALTER TABLE deal_tags DISABLE TRIGGER USER');
            await dbHelper.pool.query('DROP INDEX idx_tags_org_normalized_name_unique');

            const firstTag = (await dbHelper.pool.query(
                `INSERT INTO tags (organization_id, name)
                 VALUES ($1, $2)
                 RETURNING id`,
                [userA.org.id, rowName]
            )).rows[0];
            const duplicateTag = (await dbHelper.pool.query(
                `INSERT INTO tags (organization_id, name)
                 VALUES ($1, $2)
                 RETURNING id`,
                [userA.org.id, rowName.toLowerCase()]
            )).rows[0];
            const contact = (await dbHelper.pool.query(
                `INSERT INTO contacts (
                    organization_id, first_name, email, tags, created_by
                 ) VALUES ($1, 'Migration Drift', $2, $3, $4)
                 RETURNING id`,
                [
                    userA.org.id,
                    `migration-drift-${suffix}@test.itemize`,
                    [` ${rowName.toLowerCase()} `, arrayOnlyName, ''],
                    userA.user.id,
                ]
            )).rows[0];
            await dbHelper.pool.query(
                `INSERT INTO contact_tags (contact_id, tag_id)
                 VALUES ($1, $2)`,
                [contact.id, duplicateTag.id]
            );

            await runCanonicalTagModelMigration(dbHelper.pool);

            const repairedTags = await dbHelper.pool.query(
                `SELECT id, name
                 FROM tags
                 WHERE organization_id = $1
                   AND lower(name) IN (lower($2), lower($3))
                 ORDER BY lower(name)`,
                [userA.org.id, rowName, arrayOnlyName]
            );
            expect(repairedTags.rows).toHaveLength(2);
            const canonical = repairedTags.rows.find(
                row => row.name.toLowerCase() === rowName.toLowerCase()
            );
            expect(Number(canonical.id)).toBe(Number(firstTag.id));

            const repairedContact = (await dbHelper.pool.query(
                `SELECT c.tags,
                        array_agg(t.name ORDER BY ct.id) AS junction_names
                 FROM contacts c
                 JOIN contact_tags ct ON ct.contact_id = c.id
                 JOIN tags t ON t.id = ct.tag_id
                 WHERE c.id = $1
                 GROUP BY c.id`,
                [contact.id]
            )).rows[0];
            expect(repairedContact.tags).toEqual([rowName, arrayOnlyName]);
            expect(repairedContact.junction_names).toEqual(
                expect.arrayContaining([rowName, arrayOnlyName])
            );
        });
    });

    // ── Tag rename propagates to contacts ─────────────────────────────────────

    describe('Tag rename propagates to contacts', () => {
        let tagId;
        let contactId;

        beforeAll(async () => {
            // Create the tag
            const tagRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: `OldTagName-${Date.now()}`, color: '#6366F1' });
            tagId = tagRes.body.data.id;
            const tagName = tagRes.body.data.name;

            // Create a contact with that tag in the text tags array
            const cRes = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Tagged Contact', 'tagged-${Date.now()}@test.itemize', $2, $3)
                 RETURNING id`,
                [userA.org.id, [tagName], userA.user.id]
            );
            contactId = cRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
            await dbHelper.pool.query('DELETE FROM tags WHERE id = $1', [tagId]);
        });

        it('renaming a tag updates all contact tags arrays', async () => {
            // Get old name
            const tagRow = await dbHelper.pool.query('SELECT name FROM tags WHERE id = $1', [tagId]);
            const oldName = tagRow.rows[0].name;
            const newName = `NewTagName-${Date.now()}`;

            await request(app)
                .put(`/api/tags/${tagId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: newName });

            // Verify the contact's tags array now contains the new name
            const contactRow = await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            );
            expect(contactRow.rows[0].tags).toContain(newName);
            expect(contactRow.rows[0].tags).not.toContain(oldName);
        });
    });

    // ── Delete with removeFromContacts ────────────────────────────────────────

    describe('Delete with removeFromContacts option', () => {
        let tagId;
        let contactId;
        let tagName;

        beforeAll(async () => {
            tagName = `RemoveTag-${Date.now()}`;
            const tagRes = await request(app)
                .post('/api/tags')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ name: tagName, color: '#EF4444' });
            tagId = tagRes.body.data.id;

            const cRes = await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Tagged2', 'tagged2-${Date.now()}@test.itemize', $2, $3)
                 RETURNING id`,
                [userA.org.id, [tagName], userA.user.id]
            );
            contactId = cRes.rows[0].id;
        });

        afterAll(async () => {
            await dbHelper.pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
        });

        it('deletes tag and removes it from all contacts when removeFromContacts=true', async () => {
            const res = await request(app)
                .delete(`/api/tags/${tagId}?removeFromContacts=true`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);

            // Verify tag removed from contact
            const contactRow = await dbHelper.pool.query(
                'SELECT tags FROM contacts WHERE id = $1',
                [contactId]
            );
            expect(contactRow.rows[0].tags).not.toContain(tagName);
        });
    });

    // ── Tag suggestions ───────────────────────────────────────────────────────

    describe('GET /tags/suggestions', () => {
        beforeAll(async () => {
            // Seed a contact with tags so suggestions has something to return
            await dbHelper.pool.query(
                `INSERT INTO contacts (organization_id, first_name, email, tags, created_by)
                 VALUES ($1, 'Suggested', 'sug-${Date.now()}@test.itemize', $2, $3)`,
                [userA.org.id, ['newsletter', 'premium'], userA.user.id]
            );
        });

        it('returns unique tag strings from contacts', async () => {
            const res = await request(app)
                .get('/api/tags/suggestions')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toContain('newsletter');
            expect(res.body.data).toContain('premium');
        });

        it('User B suggestions are isolated to their org', async () => {
            const res = await request(app)
                .get('/api/tags/suggestions')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            // userB has no contacts with tags, so no 'newsletter' or 'premium'
            expect(res.body.data).not.toContain('newsletter');
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/tags');
            expect(res.status).toBe(401);
        });
    });
});
