const TestDbHelper = require('./test-db-helper');
const { runWorkflowSideEffectJobs } = require('../../jobs/workflow-side-effect-jobs');

describe('Paid entitlement PostgreSQL background-worker gate', () => {
    let dbHelper;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    async function seedQueuedEmailEffect(organizationId, key) {
        const result = await dbHelper.pool.query(
            `INSERT INTO workflow_side_effect_outbox (
               idempotency_key, organization_id, enrollment_run_at, effect_type, payload
             ) VALUES ($1, $2, CURRENT_TIMESTAMP, 'email', $3::jsonb)
             RETURNING id`,
            [key, organizationId, JSON.stringify({
                to: 'recipient@example.com',
                subject: 'Entitlement gate check',
            })]
        );
        return result.rows[0].id;
    }

    function mockEmailService() {
        return {
            sendEmail: jest.fn().mockResolvedValue({
                success: true,
                id: 'email-entitlement-check',
            }),
        };
    }

    it('delivers queued side effects for a trialing workspace seeded like a real signup', async () => {
        const { org } = await dbHelper.seedUser(
            `entitled-${Date.now()}@test.itemize`,
            'Entitled Owner'
        );
        expect(org.subscription_status).toBe('trialing');

        const outboxId = await seedQueuedEmailEffect(org.id, `entitled-${Date.now()}`);
        const emailService = mockEmailService();
        await expect(runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            emailService,
            outboxId,
        })).resolves.toMatchObject({ claimed: 1, sent: 1 });
        expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('never claims side effects for a workspace without a subscription', async () => {
        const { org } = await dbHelper.seedUser(
            `unentitled-${Date.now()}@test.itemize`,
            'Unentitled Owner'
        );
        await dbHelper.pool.query(
            `UPDATE organizations
             SET subscription_status = 'none', trial_started_at = NULL, trial_ends_at = NULL
             WHERE id = $1`,
            [org.id]
        );

        const outboxId = await seedQueuedEmailEffect(org.id, `unentitled-${Date.now()}`);
        const emailService = mockEmailService();
        await expect(runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            emailService,
            outboxId,
        })).resolves.toMatchObject({ claimed: 0, sent: 0 });
        expect(emailService.sendEmail).not.toHaveBeenCalled();

        const row = await dbHelper.pool.query(
            'SELECT status, attempt_count FROM workflow_side_effect_outbox WHERE id = $1',
            [outboxId]
        );
        expect(row.rows[0]).toMatchObject({ status: 'queued', attempt_count: 0 });
    });

    it('never claims side effects once the trial has expired', async () => {
        const { org } = await dbHelper.seedUser(
            `expired-${Date.now()}@test.itemize`,
            'Expired Owner'
        );
        await dbHelper.pool.query(
            `UPDATE organizations
             SET trial_ends_at = NOW() - INTERVAL '1 minute'
             WHERE id = $1`,
            [org.id]
        );

        const outboxId = await seedQueuedEmailEffect(org.id, `expired-${Date.now()}`);
        const emailService = mockEmailService();
        await expect(runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            emailService,
            outboxId,
        })).resolves.toMatchObject({ claimed: 0, sent: 0 });
        expect(emailService.sendEmail).not.toHaveBeenCalled();
    });
});
