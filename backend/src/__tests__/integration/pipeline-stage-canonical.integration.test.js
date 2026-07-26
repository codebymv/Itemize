const TestDbHelper = require('./test-db-helper');
const canonicalPipelineStageMigration = require(
    '../../../scripts/migrations/026_canonical_pipeline_stage_contract'
);

describe('Canonical pipeline-stage PostgreSQL contract', () => {
    let dbHelper;
    let owner;
    let outsider;
    let pipelineId;
    let dealId;

    const stages = [
        {
            id: ' canonical-qualified ',
            name: ' Qualified ',
            order: 99,
            color: ' #123456 ',
        },
        {
            id: 'canonical-proposal',
            name: 'Proposal',
            order: 0,
            color: '#654321',
        },
    ];

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        [owner, outsider] = await Promise.all([
            dbHelper.seedUser(
                `pipeline-owner-${Date.now()}@test.itemize`,
                'Pipeline Owner'
            ),
            dbHelper.seedUser(
                `pipeline-outsider-${Date.now()}@test.itemize`,
                'Pipeline Outsider'
            ),
        ]);

        const pipeline = await dbHelper.pool.query(
            `INSERT INTO pipelines (
                organization_id, name, stages, is_default, created_by
             ) VALUES ($1, $2, $3::jsonb, false, $4)
             RETURNING id`,
            [
                owner.org.id,
                `Canonical Pipeline ${Date.now()}`,
                JSON.stringify(stages),
                owner.user.id,
            ]
        );
        pipelineId = Number(pipeline.rows[0].id);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it('normalizes JSON writes into ordered canonical stage rows', async () => {
        const canonical = await dbHelper.pool.query(
            `SELECT stage_key, name, color, stage_order
             FROM pipeline_stages
             WHERE pipeline_id=$1
             ORDER BY stage_order, id`,
            [pipelineId]
        );
        expect(canonical.rows).toEqual([
            {
                stage_key: 'canonical-qualified',
                name: 'Qualified',
                color: '#123456',
                stage_order: 0,
            },
            {
                stage_key: 'canonical-proposal',
                name: 'Proposal',
                color: '#654321',
                stage_order: 1,
            },
        ]);

        const pipeline = await dbHelper.pool.query(
            'SELECT stages FROM pipelines WHERE id=$1',
            [pipelineId]
        );
        expect(pipeline.rows[0].stages).toEqual([
            {
                id: 'canonical-qualified',
                name: 'Qualified',
                order: 0,
                color: '#123456',
            },
            {
                id: 'canonical-proposal',
                name: 'Proposal',
                order: 1,
                color: '#654321',
            },
        ]);
    });

    it('projects direct canonical edits and protects an in-use stage', async () => {
        await dbHelper.pool.query(
            `UPDATE pipeline_stages
             SET name='Qualified Direct', color='#ABCDEF'
             WHERE pipeline_id=$1 AND stage_key='canonical-qualified'`,
            [pipelineId]
        );
        await dbHelper.pool.query(
            `INSERT INTO pipeline_stages (
                pipeline_id, stage_key, name, color, stage_order
             ) VALUES ($1, 'canonical-review', 'Review', '#111111', 2)`,
            [pipelineId]
        );

        let pipeline = await dbHelper.pool.query(
            'SELECT stages FROM pipelines WHERE id=$1',
            [pipelineId]
        );
        expect(pipeline.rows[0].stages).toEqual([
            {
                id: 'canonical-qualified',
                name: 'Qualified Direct',
                order: 0,
                color: '#ABCDEF',
            },
            {
                id: 'canonical-proposal',
                name: 'Proposal',
                order: 1,
                color: '#654321',
            },
            {
                id: 'canonical-review',
                name: 'Review',
                order: 2,
                color: '#111111',
            },
        ]);

        await dbHelper.pool.query(
            `DELETE FROM pipeline_stages
             WHERE pipeline_id=$1 AND stage_key='canonical-review'`,
            [pipelineId]
        );
        const deal = await dbHelper.pool.query(
            `INSERT INTO deals (
                organization_id, pipeline_id, stage_id, title, created_by
             ) VALUES ($1, $2, 'canonical-qualified', $3, $4)
             RETURNING id`,
            [
                owner.org.id,
                pipelineId,
                `Canonical Deal ${Date.now()}`,
                owner.user.id,
            ]
        );
        dealId = Number(deal.rows[0].id);

        await expect(dbHelper.pool.query(
            `DELETE FROM pipeline_stages
             WHERE pipeline_id=$1 AND stage_key='canonical-qualified'`,
            [pipelineId]
        )).rejects.toMatchObject({ code: '23503' });

        pipeline = await dbHelper.pool.query(
            'SELECT stages FROM pipelines WHERE id=$1',
            [pipelineId]
        );
        expect(pipeline.rows[0].stages.map(stage => stage.id)).toEqual([
            'canonical-qualified',
            'canonical-proposal',
        ]);
    });

    it('enforces tenant ownership and stage membership for direct deal writes', async () => {
        const foreign = await dbHelper.pool.query(
            `INSERT INTO pipelines (
                organization_id, name, stages, is_default, created_by
             ) VALUES ($1, $2, $3::jsonb, false, $4)
             RETURNING id`,
            [
                outsider.org.id,
                `Foreign Pipeline ${Date.now()}`,
                JSON.stringify([
                    {
                        id: 'foreign-stage',
                        name: 'Foreign',
                        color: '#123456',
                    },
                ]),
                outsider.user.id,
            ]
        );

        await expect(dbHelper.pool.query(
            `INSERT INTO deals (
                organization_id, pipeline_id, stage_id, title, created_by
             ) VALUES ($1, $2, 'foreign-stage', 'Cross Tenant', $3)`,
            [owner.org.id, foreign.rows[0].id, owner.user.id]
        )).rejects.toMatchObject({ code: '23503' });

        await expect(dbHelper.pool.query(
            `INSERT INTO deals (
                organization_id, pipeline_id, stage_id, title, created_by
             ) VALUES ($1, $2, 'missing-stage', 'Missing Stage', $3)`,
            [owner.org.id, pipelineId, owner.user.id]
        )).rejects.toMatchObject({ code: '23503' });
    });

    it('database-enforces a single default pipeline per organization', async () => {
        const created = await dbHelper.pool.query(
            `INSERT INTO pipelines (
                organization_id, name, stages, is_default, created_by
             ) VALUES
                ($1, $2, $4::jsonb, false, $5),
                ($1, $3, $4::jsonb, false, $5)
             RETURNING id`,
            [
                owner.org.id,
                `Default Candidate A ${Date.now()}`,
                `Default Candidate B ${Date.now()}`,
                JSON.stringify([
                    { id: 'lead', name: 'Lead', color: '#123456' },
                ]),
                owner.user.id,
            ]
        );
        await expect(dbHelper.pool.query(
            `UPDATE pipelines
             SET is_default=true
             WHERE id=ANY($1::int[])`,
            [created.rows.map(row => Number(row.id))]
        )).rejects.toMatchObject({ code: '23505' });
    });

    it('repairs stale shadow rows and preserves deal-referenced missing stages', async () => {
        const repairPipeline = await dbHelper.pool.query(
            `INSERT INTO pipelines (
                organization_id, name, stages, is_default, created_by
             ) VALUES ($1, $2, $3::jsonb, false, $4)
             RETURNING id`,
            [
                owner.org.id,
                `Pipeline Drift ${Date.now()}`,
                JSON.stringify([
                    {
                        id: 'json-live',
                        name: 'Live Before Drift',
                        color: '#010101',
                    },
                    {
                        id: 'deal-shadow',
                        name: 'Deal Before Drift',
                        color: '#020202',
                    },
                ]),
                owner.user.id,
            ]
        );
        const repairPipelineId = Number(repairPipeline.rows[0].id);
        await dbHelper.pool.query(
            `INSERT INTO deals (
                organization_id, pipeline_id, stage_id, title, created_by
             ) VALUES ($1, $2, 'deal-shadow', 'Drift Repair Deal', $3)`,
            [owner.org.id, repairPipelineId, owner.user.id]
        );

        await dbHelper.pool.query(
            'DROP TRIGGER pipelines_prepare_canonical_stages ON pipelines'
        );
        await dbHelper.pool.query(
            'DROP TRIGGER pipelines_sync_canonical_stages ON pipelines'
        );
        await dbHelper.pool.query(
            'DROP TRIGGER pipeline_stages_prepare_row ON pipeline_stages'
        );
        await dbHelper.pool.query(
            'DROP TRIGGER pipeline_stages_project_json ON pipeline_stages'
        );
        await dbHelper.pool.query(
            'ALTER TABLE deals DROP CONSTRAINT deals_pipeline_stage_fk'
        );
        await dbHelper.pool.query(
            `UPDATE pipelines
             SET stages=$2::jsonb
             WHERE id=$1`,
            [
                repairPipelineId,
                JSON.stringify([
                    {
                        id: 'json-live',
                        name: 'JSON Wins',
                        color: '#AAAAAA',
                    },
                ]),
            ]
        );
        await dbHelper.pool.query(
            `UPDATE pipeline_stages
             SET name='Shadow Deal Stage', color='#BBBBBB'
             WHERE pipeline_id=$1 AND stage_key='deal-shadow'`,
            [repairPipelineId]
        );
        await dbHelper.pool.query(
            `INSERT INTO pipeline_stages (
                pipeline_id, stage_key, name, color, stage_order
             ) VALUES ($1, 'unused-shadow', 'Unused Shadow', '#CCCCCC', 2)`,
            [repairPipelineId]
        );

        await canonicalPipelineStageMigration.up(dbHelper.pool);

        const repaired = await dbHelper.pool.query(
            `SELECT stage_key, name, color, stage_order
             FROM pipeline_stages
             WHERE pipeline_id=$1
             ORDER BY stage_order, id`,
            [repairPipelineId]
        );
        expect(repaired.rows).toEqual([
            {
                stage_key: 'json-live',
                name: 'JSON Wins',
                color: '#AAAAAA',
                stage_order: 0,
            },
            {
                stage_key: 'deal-shadow',
                name: 'Shadow Deal Stage',
                color: '#BBBBBB',
                stage_order: 1,
            },
        ]);

        const constraints = await dbHelper.pool.query(
            `SELECT conname
             FROM pg_constraint
             WHERE conrelid='deals'::regclass
               AND conname IN (
                 'deals_pipeline_organization_fk',
                 'deals_pipeline_stage_fk'
               )
             ORDER BY conname`
        );
        expect(constraints.rows.map(row => row.conname)).toEqual([
            'deals_pipeline_organization_fk',
            'deals_pipeline_stage_fk',
        ]);
        const deal = await dbHelper.pool.query(
            'SELECT pipeline_id, stage_id FROM deals WHERE id=$1',
            [dealId]
        );
        expect(deal.rows[0]).toEqual({
            pipeline_id: pipelineId,
            stage_id: 'canonical-qualified',
        });
    });
});
