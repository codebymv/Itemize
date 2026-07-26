const TestDbHelper = require('./test-db-helper');
const { compileCampaignAudience } = require('../../services/campaignAudience');
const { compileSegmentCondition } = require('../../services/segmentFilter');
const { runCanonicalTagModelMigration } = require('../../db_tag_canonical_migrations');

describe('Canonical tag PostgreSQL contract', () => {
    let dbHelper;
    let owner;
    let outsider;
    let contactId;
    let dealId;
    let sharedTagId;
    let sharedTagName;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        [owner, outsider] = await Promise.all([
            dbHelper.seedUser(`tag-owner-${Date.now()}@test.itemize`, 'Tag Owner'),
            dbHelper.seedUser(`tag-outsider-${Date.now()}@test.itemize`, 'Tag Outsider'),
        ]);

        sharedTagName = `Canonical-${Date.now()}`;
        const contact = await dbHelper.pool.query(
            `INSERT INTO contacts (
                organization_id, first_name, email, tags, created_by
             ) VALUES ($1, 'Canonical Contact', $2, $3, $4)
             RETURNING id`,
            [
                owner.org.id,
                `canonical-${Date.now()}@test.itemize`,
                [` ${sharedTagName} `, sharedTagName.toLowerCase(), '', 'ContactOnly'],
                owner.user.id,
            ]
        );
        contactId = Number(contact.rows[0].id);

        const pipeline = await dbHelper.pool.query(
            `INSERT INTO pipelines (
                organization_id, name, stages, is_default, created_by
             ) VALUES ($1, $2, $3::jsonb, false, $4)
             RETURNING id`,
            [
                owner.org.id,
                `Canonical Pipeline ${Date.now()}`,
                JSON.stringify([{ id: 'lead', name: 'Lead' }]),
                owner.user.id,
            ]
        );
        const deal = await dbHelper.pool.query(
            `INSERT INTO deals (
                organization_id, pipeline_id, contact_id, stage_id,
                title, tags, created_by
             ) VALUES ($1, $2, $3, 'lead', $4, $5, $6)
             RETURNING id`,
            [
                owner.org.id,
                pipeline.rows[0].id,
                contactId,
                `Canonical Deal ${Date.now()}`,
                [sharedTagName.toLowerCase(), 'DealOnly'],
                owner.user.id,
            ]
        );
        dealId = Number(deal.rows[0].id);
        const shared = await dbHelper.pool.query(
            `SELECT id
             FROM tags
             WHERE organization_id=$1 AND lower(name)=lower($2)`,
            [owner.org.id, sharedTagName]
        );
        sharedTagId = Number(shared.rows[0].id);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it('normalizes legacy arrays into canonical rows and stable junction IDs', async () => {
        const projections = await dbHelper.pool.query(
            `SELECT
                (SELECT tags FROM contacts WHERE id=$1) AS contact_tags,
                (SELECT tags FROM deals WHERE id=$2) AS deal_tags,
                EXISTS (
                    SELECT 1 FROM contact_tags
                    WHERE contact_id=$1 AND tag_id=$3
                ) AS contact_member,
                EXISTS (
                    SELECT 1 FROM deal_tags
                    WHERE deal_id=$2 AND tag_id=$3
                ) AS deal_member`,
            [contactId, dealId, sharedTagId]
        );
        expect(projections.rows[0]).toEqual({
            contact_tags: [sharedTagName, 'ContactOnly'],
            deal_tags: [sharedTagName, 'DealOnly'],
            contact_member: true,
            deal_member: true,
        });

        const canonicalRows = await dbHelper.pool.query(
            `SELECT name
             FROM tags
             WHERE organization_id=$1
               AND lower(name)=ANY($2::text[])
             ORDER BY lower(name)`,
            [
                owner.org.id,
                [sharedTagName.toLowerCase(), 'contactonly', 'dealonly'],
            ]
        );
        expect(canonicalRows.rows).toHaveLength(3);
    });

    it('makes canonical membership visible to campaign and segment compilers', async () => {
        const audience = compileCampaignAudience(
            {
                segment_type: 'tag',
                tag_ids: [sharedTagId],
                excluded_tag_ids: [],
            },
            { alias: 'c', startIndex: 2 }
        );
        const audienceRows = await dbHelper.pool.query(
            `SELECT c.id
             FROM contacts c
             WHERE c.organization_id=$1 AND ${audience.condition}`,
            [owner.org.id, ...audience.params]
        );
        expect(audienceRows.rows.map(row => Number(row.id))).toContain(contactId);

        const segment = compileSegmentCondition(
            {
                segment_type: 'dynamic',
                filter_type: 'and',
                filters: [{
                    field: 'tags',
                    operator: 'has_any',
                    value: [sharedTagId],
                }],
            },
            { alias: 'c', startIndex: 2 }
        );
        const segmentRows = await dbHelper.pool.query(
            `SELECT c.id
             FROM contacts c
             WHERE c.organization_id=$1 AND ${segment.condition}`,
            [owner.org.id, ...segment.params]
        );
        expect(segmentRows.rows.map(row => Number(row.id))).toContain(contactId);
    });

    it('projects direct junction changes and rejects cross-tenant membership', async () => {
        const directName = `Direct-${Date.now()}`;
        const directTag = await dbHelper.pool.query(
            `INSERT INTO tags (organization_id, name)
             VALUES ($1, $2)
             RETURNING id`,
            [owner.org.id, directName]
        );
        const directTagId = Number(directTag.rows[0].id);

        await dbHelper.pool.query(
            `INSERT INTO contact_tags (contact_id, tag_id)
             VALUES ($1, $2)`,
            [contactId, directTagId]
        );
        let contact = await dbHelper.pool.query(
            'SELECT tags FROM contacts WHERE id=$1',
            [contactId]
        );
        expect(contact.rows[0].tags).toContain(directName);

        await dbHelper.pool.query(
            'DELETE FROM contact_tags WHERE contact_id=$1 AND tag_id=$2',
            [contactId, directTagId]
        );
        contact = await dbHelper.pool.query(
            'SELECT tags FROM contacts WHERE id=$1',
            [contactId]
        );
        expect(contact.rows[0].tags).not.toContain(directName);

        const foreignContact = await dbHelper.pool.query(
            `INSERT INTO contacts (
                organization_id, first_name, email, created_by
             ) VALUES ($1, 'Foreign Contact', $2, $3)
             RETURNING id`,
            [
                outsider.org.id,
                `foreign-tag-${Date.now()}@test.itemize`,
                outsider.user.id,
            ]
        );
        await expect(dbHelper.pool.query(
            `INSERT INTO contact_tags (contact_id, tag_id)
             VALUES ($1, $2)`,
            [foreignContact.rows[0].id, directTagId]
        )).rejects.toMatchObject({ code: '23514' });

        const sameNameOtherTenant = await dbHelper.pool.query(
            `INSERT INTO tags (organization_id, name)
             VALUES ($1, $2)
             RETURNING id`,
            [outsider.org.id, directName.toLowerCase()]
        );
        expect(Number(sameNameOtherTenant.rows[0].id)).not.toBe(directTagId);
    });

    it('keeps identity stable on rename and removes every projection on delete', async () => {
        const renamed = `Renamed-${Date.now()}`;
        const updated = await dbHelper.pool.query(
            `UPDATE tags
             SET name=$1
             WHERE id=$2 AND organization_id=$3
             RETURNING id`,
            [renamed, sharedTagId, owner.org.id]
        );
        expect(Number(updated.rows[0].id)).toBe(sharedTagId);

        const renamedState = await dbHelper.pool.query(
            `SELECT
                (SELECT tags FROM contacts WHERE id=$1) AS contact_tags,
                (SELECT tags FROM deals WHERE id=$2) AS deal_tags,
                EXISTS (
                    SELECT 1 FROM contact_tags
                    WHERE contact_id=$1 AND tag_id=$3
                ) AS contact_member,
                EXISTS (
                    SELECT 1 FROM deal_tags
                    WHERE deal_id=$2 AND tag_id=$3
                ) AS deal_member`,
            [contactId, dealId, sharedTagId]
        );
        expect(renamedState.rows[0]).toEqual({
            contact_tags: [renamed, 'ContactOnly'],
            deal_tags: [renamed, 'DealOnly'],
            contact_member: true,
            deal_member: true,
        });

        await dbHelper.pool.query(
            'DELETE FROM tags WHERE id=$1 AND organization_id=$2',
            [sharedTagId, owner.org.id]
        );
        const deletedState = await dbHelper.pool.query(
            `SELECT
                (SELECT tags FROM contacts WHERE id=$1) AS contact_tags,
                (SELECT tags FROM deals WHERE id=$2) AS deal_tags,
                EXISTS (SELECT 1 FROM contact_tags WHERE tag_id=$3)
                    AS has_contact_membership,
                EXISTS (SELECT 1 FROM deal_tags WHERE tag_id=$3)
                    AS has_deal_membership`,
            [contactId, dealId, sharedTagId]
        );
        expect(deletedState.rows[0].contact_tags).not.toContain(renamed);
        expect(deletedState.rows[0].deal_tags).not.toContain(renamed);
        expect(deletedState.rows[0].has_contact_membership).toBe(false);
        expect(deletedState.rows[0].has_deal_membership).toBe(false);
    });

    it('enforces organization-scoped normalized uniqueness in PostgreSQL', async () => {
        const name = `DatabaseUnique-${Date.now()}`;
        await dbHelper.pool.query(
            'INSERT INTO tags (organization_id, name) VALUES ($1, $2)',
            [owner.org.id, name]
        );
        await expect(dbHelper.pool.query(
            'INSERT INTO tags (organization_id, name) VALUES ($1, $2)',
            [owner.org.id, ` ${name.toLowerCase()} `]
        )).rejects.toMatchObject({ code: '23505' });
    });

    it('repairs case drift while preserving array-only and junction-only membership', async () => {
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

        const firstTag = await dbHelper.pool.query(
            `INSERT INTO tags (organization_id, name)
             VALUES ($1, $2)
             RETURNING id`,
            [owner.org.id, rowName]
        );
        const duplicateTag = await dbHelper.pool.query(
            `INSERT INTO tags (organization_id, name)
             VALUES ($1, $2)
             RETURNING id`,
            [owner.org.id, rowName.toLowerCase()]
        );
        const contact = await dbHelper.pool.query(
            `INSERT INTO contacts (
                organization_id, first_name, email, tags, created_by
             ) VALUES ($1, 'Migration Drift', $2, $3, $4)
             RETURNING id`,
            [
                owner.org.id,
                `migration-drift-${suffix}@test.itemize`,
                [` ${rowName.toLowerCase()} `, arrayOnlyName, ''],
                owner.user.id,
            ]
        );
        await dbHelper.pool.query(
            `INSERT INTO contact_tags (contact_id, tag_id)
             VALUES ($1, $2)`,
            [contact.rows[0].id, duplicateTag.rows[0].id]
        );

        await runCanonicalTagModelMigration(dbHelper.pool);

        const repairedTags = await dbHelper.pool.query(
            `SELECT id, name
             FROM tags
             WHERE organization_id=$1
               AND lower(name) IN (lower($2), lower($3))
             ORDER BY lower(name)`,
            [owner.org.id, rowName, arrayOnlyName]
        );
        expect(repairedTags.rows).toHaveLength(2);
        const canonical = repairedTags.rows.find(
            row => row.name.toLowerCase() === rowName.toLowerCase()
        );
        expect(Number(canonical.id)).toBe(Number(firstTag.rows[0].id));

        const repairedContact = await dbHelper.pool.query(
            `SELECT c.tags,
                    array_agg(t.name ORDER BY ct.id) AS junction_names
             FROM contacts c
             JOIN contact_tags ct ON ct.contact_id=c.id
             JOIN tags t ON t.id=ct.tag_id
             WHERE c.id=$1
             GROUP BY c.id`,
            [contact.rows[0].id]
        );
        expect(repairedContact.rows[0].tags).toEqual([rowName, arrayOnlyName]);
        expect(repairedContact.rows[0].junction_names).toEqual(
            expect.arrayContaining([rowName, arrayOnlyName])
        );
    });
});
