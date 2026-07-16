const TestDbHelper = require('./test-db-helper');
const {
    AutomationEngine,
    claimWorkflowEnrollment,
} = require('../../services/automationEngine');
const emailService = require('../../services/emailService');
const { runWorkflowSideEffectJobs } = require('../../jobs/workflow-side-effect-jobs');

describe('Automation engine PostgreSQL execution', () => {
    let dbHelper;
    let user;
    let engine;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        user = await dbHelper.seedUser(`automation-${Date.now()}@test.itemize`, 'Automation User');
        engine = new AutomationEngine(dbHelper.pool);
    }, 30000);

    afterAll(async () => dbHelper.teardown(), 30000);
    afterEach(() => jest.restoreAllMocks());

    async function seedExecution(steps, contactOverrides = {}) {
        const contact = (await dbHelper.pool.query(
            `INSERT INTO contacts
              (organization_id, first_name, email, phone, status, tags, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                user.org.id,
                contactOverrides.first_name || 'Automation',
                contactOverrides.email || `automation-${Date.now()}@example.test`,
                contactOverrides.phone || '+16025550120',
                contactOverrides.status || 'active',
                contactOverrides.tags || [],
                user.user.id,
            ]
        )).rows[0];
        const workflow = (await dbHelper.pool.query(
            `INSERT INTO workflows
              (organization_id, name, trigger_type, is_active, created_by)
             VALUES ($1, $2, 'manual', true, $3)
             RETURNING *`,
            [user.org.id, `Execution ${Date.now()}-${Math.random()}`, user.user.id]
        )).rows[0];

        for (let index = 0; index < steps.length; index++) {
            const step = steps[index];
            await dbHelper.pool.query(
                `INSERT INTO workflow_steps
                  (workflow_id, step_order, step_type, step_config, condition_config, true_branch_step, false_branch_step)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    workflow.id,
                    index + 1,
                    step.step_type,
                    JSON.stringify(step.step_config || {}),
                    step.condition_config ? JSON.stringify(step.condition_config) : null,
                    step.true_branch_step || null,
                    step.false_branch_step || null,
                ]
            );
        }

        const enrollment = (await dbHelper.pool.query(
            `INSERT INTO workflow_enrollments
              (workflow_id, contact_id, status, current_step, next_action_at)
             VALUES ($1, $2, 'active', 1, CURRENT_TIMESTAMP)
             RETURNING *`,
            [workflow.id, contact.id]
        )).rows[0];

        return { contact, workflow, enrollment };
    }

    test('executes database steps in order and records completion logs', async () => {
        const seeded = await seedExecution([
            { step_type: 'add_tag', step_config: { tag_name: 'automated' } },
            { step_type: 'update_contact', step_config: { status: 'inactive', custom_fields: { score: 10 } } },
            { step_type: 'create_task', step_config: { title: 'Follow up', priority: 'high' } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            const result = await engine.processEnrollment(client, seeded.enrollment.id);
            expect(result).toMatchObject({ success: true, completed: true });
        } finally {
            client.release();
        }

        const [contact, enrollment, tasks, logs] = await Promise.all([
            dbHelper.pool.query('SELECT status, tags, custom_fields FROM contacts WHERE id = $1', [seeded.contact.id]),
            dbHelper.pool.query('SELECT status FROM workflow_enrollments WHERE id = $1', [seeded.enrollment.id]),
            dbHelper.pool.query('SELECT title, priority FROM tasks WHERE contact_id = $1', [seeded.contact.id]),
            dbHelper.pool.query('SELECT status, action_type FROM workflow_execution_logs WHERE enrollment_id = $1', [seeded.enrollment.id]),
        ]);
        expect(contact.rows[0]).toMatchObject({ status: 'inactive', tags: ['automated'] });
        expect(contact.rows[0].custom_fields).toMatchObject({ score: 10 });
        expect(enrollment.rows[0].status).toBe('completed');
        expect(tasks.rows).toEqual([expect.objectContaining({ title: 'Follow up', priority: 'high' })]);
        expect(logs.rows).toHaveLength(6);
        expect(logs.rows.filter(row => row.status === 'completed')).toHaveLength(3);
    });

    test('wait steps persist the next due action without running later steps', async () => {
        const seeded = await seedExecution([
            { step_type: 'wait', step_config: { delay_minutes: 5 } },
            { step_type: 'add_tag', step_config: { tag_name: 'after-wait' } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            const result = await engine.processEnrollment(client, seeded.enrollment.id);
            expect(result).toMatchObject({ success: true, waiting: true });
        } finally {
            client.release();
        }

        const enrollment = await dbHelper.pool.query(
            'SELECT status, current_step, next_action_at FROM workflow_enrollments WHERE id = $1',
            [seeded.enrollment.id]
        );
        const contact = await dbHelper.pool.query('SELECT tags FROM contacts WHERE id = $1', [seeded.contact.id]);
        expect(enrollment.rows[0].status).toBe('active');
        expect(enrollment.rows[0].current_step).toBe(2);
        expect(new Date(enrollment.rows[0].next_action_at).getTime()).toBeGreaterThan(Date.now());
        expect(contact.rows[0].tags).not.toContain('after-wait');
    });

    test('condition branches skip non-selected steps', async () => {
        const seeded = await seedExecution([
            {
                step_type: 'condition',
                condition_config: { field: 'status', operator: 'equals', value: 'inactive' },
                true_branch_step: 2,
                false_branch_step: 3,
            },
            { step_type: 'add_tag', step_config: { tag_name: 'wrong-branch' } },
            { step_type: 'add_tag', step_config: { tag_name: 'right-branch' } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            await engine.processEnrollment(client, seeded.enrollment.id);
        } finally {
            client.release();
        }

        const contact = await dbHelper.pool.query('SELECT tags FROM contacts WHERE id = $1', [seeded.contact.id]);
        expect(contact.rows[0].tags).toContain('right-branch');
        expect(contact.rows[0].tags).not.toContain('wrong-branch');
    });

    test('concurrent enrollment workers queue and deliver one provider step once', async () => {
        const template = (await dbHelper.pool.query(
            `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
             VALUES ($1, 'Automation email', 'Hello', '<p>Hello</p>', $2)
             RETURNING id`,
            [user.org.id, user.user.id]
        )).rows[0];
        const seeded = await seedExecution([
            { step_type: 'send_email', step_config: { template_id: template.id } },
        ]);
        const send = jest.spyOn(emailService, 'sendEmail').mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 75));
            return { success: true, id: `provider-${Date.now()}` };
        });
        const [clientA, clientB] = await Promise.all([
            dbHelper.pool.connect(),
            dbHelper.pool.connect(),
        ]);

        let results;
        try {
            results = await Promise.all([
                engine.processEnrollment(clientA, seeded.enrollment.id),
                engine.processEnrollment(clientB, seeded.enrollment.id),
            ]);
        } finally {
            clientA.release();
            clientB.release();
        }

        expect(send).not.toHaveBeenCalled();
        expect(results.some(result => result.claimed === true)).toBe(true);
        const queued = await dbHelper.pool.query(
            `SELECT id, status, idempotency_key
             FROM workflow_side_effect_outbox
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        expect(queued.rows).toHaveLength(1);
        expect(queued.rows[0]).toMatchObject({ status: 'queued' });

        const workerResults = await Promise.all([
            runWorkflowSideEffectJobs(dbHelper.pool, { batchSize: 1, emailService }),
            runWorkflowSideEffectJobs(dbHelper.pool, { batchSize: 1, emailService }),
        ]);

        expect(send).toHaveBeenCalledTimes(1);
        expect(workerResults.reduce((total, result) => total + result.sent, 0)).toBe(1);
        const logs = await dbHelper.pool.query(
            'SELECT workflow_side_effect_id, external_id FROM email_logs WHERE workflow_enrollment_id = $1',
            [seeded.enrollment.id]
        );
        expect(logs.rows).toHaveLength(1);
        expect(logs.rows[0].workflow_side_effect_id).toBe(queued.rows[0].id);
        const sent = await dbHelper.pool.query(
            'SELECT status, attempt_count, provider_id FROM workflow_side_effect_outbox WHERE id = $1',
            [queued.rows[0].id]
        );
        expect(sent.rows[0]).toMatchObject({ status: 'sent', attempt_count: 1 });
        expect(sent.rows[0].provider_id).toBeTruthy();
    });

    test('a recovered lease fences the stale step worker before database mutation', async () => {
        const seeded = await seedExecution([
            { step_type: 'create_task', step_config: { title: 'Lease-fenced task' } },
        ]);
        const staleClaim = await claimWorkflowEnrollment(dbHelper.pool, {
            enrollmentId: seeded.enrollment.id,
            leaseSeconds: 1,
        });
        expect(staleClaim).toBeTruthy();
        await dbHelper.pool.query(
            `UPDATE workflow_enrollments
             SET execution_lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
             WHERE id = $1`,
            [seeded.enrollment.id]
        );
        const recoveredClaim = await claimWorkflowEnrollment(dbHelper.pool, {
            enrollmentId: seeded.enrollment.id,
        });
        expect(recoveredClaim.execution_attempt_count)
            .toBe(staleClaim.execution_attempt_count + 1);

        const staleClient = await dbHelper.pool.connect();
        const recoveredClient = await dbHelper.pool.connect();
        try {
            const staleResult = await engine.processEnrollment(
                staleClient,
                seeded.enrollment.id,
                staleClaim
            );
            expect(staleResult).toMatchObject({
                success: false,
                claimed: true,
                stale: true,
            });

            const recoveredResult = await engine.processEnrollment(
                recoveredClient,
                seeded.enrollment.id,
                recoveredClaim
            );
            expect(recoveredResult).toMatchObject({ success: true, completed: true });
        } finally {
            staleClient.release();
            recoveredClient.release();
        }

        const tasks = await dbHelper.pool.query(
            'SELECT title FROM tasks WHERE contact_id = $1',
            [seeded.contact.id]
        );
        expect(tasks.rows).toEqual([{ title: 'Lease-fenced task' }]);
    });

    test('provider failures retry from the durable snapshot and then succeed', async () => {
        const template = (await dbHelper.pool.query(
            `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
             VALUES ($1, 'Retry email', 'Retry me', '<p>Retry me</p>', $2)
             RETURNING id`,
            [user.org.id, user.user.id]
        )).rows[0];
        const seeded = await seedExecution([
            { step_type: 'send_email', step_config: { template_id: template.id } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            await engine.processEnrollment(client, seeded.enrollment.id);
        } finally {
            client.release();
        }

        const sendEmail = jest.fn()
            .mockResolvedValueOnce({ success: false, error: 'recipient@example.test re_live_secret' })
            .mockResolvedValueOnce({ success: true, id: 'provider-retry-success' });
        const failed = await runWorkflowSideEffectJobs(dbHelper.pool, {
            baseDelayMs: 1,
            batchSize: 1,
            emailService: { sendEmail },
            maxAttempts: 3,
        });
        expect(failed).toMatchObject({ claimed: 1, retry: 1 });

        const deferred = await dbHelper.pool.query(
            `SELECT id, status, attempt_count, last_error
             FROM workflow_side_effect_outbox
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        expect(deferred.rows[0]).toMatchObject({
            status: 'retry',
            attempt_count: 1,
            last_error: '[redacted-email] [redacted-secret]',
        });
        await dbHelper.pool.query(
            `UPDATE workflow_side_effect_outbox
             SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
             WHERE id = $1`,
            [deferred.rows[0].id]
        );

        const succeeded = await runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            emailService: { sendEmail },
            maxAttempts: 3,
        });
        expect(succeeded).toMatchObject({ claimed: 1, sent: 1 });
        const sent = await dbHelper.pool.query(
            'SELECT status, attempt_count, last_error FROM workflow_side_effect_outbox WHERE id = $1',
            [deferred.rows[0].id]
        );
        expect(sent.rows[0]).toMatchObject({
            status: 'sent',
            attempt_count: 2,
            last_error: null,
        });
        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(sendEmail.mock.calls[0][0].idempotencyKey)
            .toBe(sendEmail.mock.calls[1][0].idempotencyKey);
    });

    test('an expired worker lease is recovered by only one competing worker', async () => {
        const template = (await dbHelper.pool.query(
            `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
             VALUES ($1, 'Lease email', 'Lease recovery', '<p>Lease recovery</p>', $2)
             RETURNING id`,
            [user.org.id, user.user.id]
        )).rows[0];
        const seeded = await seedExecution([
            { step_type: 'send_email', step_config: { template_id: template.id } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            await engine.processEnrollment(client, seeded.enrollment.id);
        } finally {
            client.release();
        }
        await dbHelper.pool.query(
            `UPDATE workflow_side_effect_outbox
             SET status = 'processing',
                 attempt_count = 1,
                 lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        const sendEmail = jest.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { success: true, id: 'provider-lease-success' };
        });

        const results = await Promise.all([
            runWorkflowSideEffectJobs(dbHelper.pool, {
                batchSize: 1,
                emailService: { sendEmail },
            }),
            runWorkflowSideEffectJobs(dbHelper.pool, {
                batchSize: 1,
                emailService: { sendEmail },
            }),
        ]);

        expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        const outbox = await dbHelper.pool.query(
            'SELECT status, attempt_count FROM workflow_side_effect_outbox WHERE enrollment_id = $1',
            [seeded.enrollment.id]
        );
        expect(outbox.rows[0]).toMatchObject({ status: 'sent', attempt_count: 2 });
    });

    test('an expired SMS lease requires reconciliation and is not automatically resent', async () => {
        await dbHelper.pool.query(
            `INSERT INTO sms_receiving_numbers (
               organization_id, phone_number, is_primary, is_active
             ) VALUES ($1, $2, true, true)
             ON CONFLICT (phone_number) DO UPDATE
             SET organization_id = EXCLUDED.organization_id,
                 is_primary = true,
                 is_active = true`,
            [user.org.id, '+16025550100']
        );
        const seeded = await seedExecution([
            { step_type: 'send_sms', step_config: { message: 'Reconcile {{first_name}}' } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            await engine.processEnrollment(client, seeded.enrollment.id);
        } finally {
            client.release();
        }
        await dbHelper.pool.query(
            `UPDATE workflow_side_effect_outbox
             SET status = 'processing',
                 attempt_count = 1,
                 lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        const sendSms = jest.fn().mockResolvedValue({
            success: true,
            id: 'SM00000000000000000000000000000000',
        });

        const first = await runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            smsService: { sendSms },
        });
        const second = await runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            smsService: { sendSms },
        });

        expect(first).toMatchObject({
            claimed: 0,
            reconciliationRequired: 1,
            sent: 0,
        });
        expect(second).toMatchObject({
            claimed: 0,
            reconciliationRequired: 0,
            sent: 0,
        });
        expect(sendSms).not.toHaveBeenCalled();
        const outbox = await dbHelper.pool.query(
            `SELECT status, attempt_count, reconciliation_reason,
                    reconciliation_required_at, lease_expires_at
             FROM workflow_side_effect_outbox
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        expect(outbox.rows[0]).toMatchObject({
            status: 'reconciliation_required',
            attempt_count: 1,
            reconciliation_reason: 'provider_result_unknown',
            lease_expires_at: null,
        });
        expect(outbox.rows[0].reconciliation_required_at).toBeTruthy();
    });

    test('an ambiguous SMS provider response stops immediately for reconciliation', async () => {
        await dbHelper.pool.query(
            `INSERT INTO sms_receiving_numbers (
               organization_id, phone_number, is_primary, is_active
             ) VALUES ($1, $2, true, true)
             ON CONFLICT (phone_number) DO UPDATE
             SET organization_id = EXCLUDED.organization_id,
                 is_primary = true,
                 is_active = true`,
            [user.org.id, '+16025550100']
        );
        const seeded = await seedExecution([
            { step_type: 'send_sms', step_config: { message: 'Ambiguous {{first_name}}' } },
        ]);
        const client = await dbHelper.pool.connect();
        try {
            await engine.processEnrollment(client, seeded.enrollment.id);
        } finally {
            client.release();
        }
        const sendSms = jest.fn().mockResolvedValue({
            success: false,
            error: 'socket closed after request write',
            outcomeUnknown: true,
        });

        const result = await runWorkflowSideEffectJobs(dbHelper.pool, {
            batchSize: 1,
            smsService: { sendSms },
        });

        expect(result).toMatchObject({
            claimed: 1,
            reconciliationRequired: 1,
            retry: 0,
            sent: 0,
        });
        expect(sendSms).toHaveBeenCalledTimes(1);
        const outbox = await dbHelper.pool.query(
            `SELECT status, attempt_count, reconciliation_reason, next_attempt_at
             FROM workflow_side_effect_outbox
             WHERE enrollment_id = $1`,
            [seeded.enrollment.id]
        );
        expect(outbox.rows[0]).toMatchObject({
            status: 'reconciliation_required',
            attempt_count: 1,
            reconciliation_reason: 'provider_result_unknown',
            next_attempt_at: null,
        });
    });
});
