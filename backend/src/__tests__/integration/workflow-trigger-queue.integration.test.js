const TestDbHelper = require('./test-db-helper');
const { withTransaction } = require('../../utils/db');
const {
  runScheduledWorkflowJobs,
  runWorkflowEnrollmentJobs,
  runWorkflowTriggerJobs,
} = require('../../jobs/workflow-trigger-jobs');
const {
  enqueueWorkflowTrigger,
  workflowTriggerEventKey,
} = require('../../services/workflowTriggerQueue');

describe('Workflow trigger queue PostgreSQL boundary', () => {
  let dbHelper;
  let user;

  beforeAll(async () => {
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    user = await dbHelper.seedUser(`workflow-queue-${Date.now()}@test.itemize`, 'Queue User');
  }, 30000);

  afterAll(async () => dbHelper.teardown(), 30000);

  async function seedContact(emailSuffix) {
    return (await dbHelper.pool.query(`
      INSERT INTO contacts (organization_id, first_name, email, created_by)
      VALUES ($1, 'Queued', $2, $3)
      RETURNING *
    `, [
      user.org.id,
      `workflow-queue-${emailSuffix}-${Date.now()}@example.test`,
      user.user.id,
    ])).rows[0];
  }

  async function seedWorkflow(triggerConfig = {}) {
    const workflow = (await dbHelper.pool.query(`
      INSERT INTO workflows (
        organization_id, name, trigger_type, trigger_config, is_active, created_by
      ) VALUES ($1, $2, 'contact_added', $3::jsonb, true, $4)
      RETURNING *
    `, [
      user.org.id,
      `Queue workflow ${Date.now()}-${Math.random()}`,
      JSON.stringify(triggerConfig),
      user.user.id,
    ])).rows[0];
    await dbHelper.pool.query(`
      INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
      VALUES ($1, 1, 'add_tag', '{"tag_name":"queue-processed"}'::jsonb)
    `, [workflow.id]);
    return workflow;
  }

  test('atomically fans a domain event into an enrollment and schedules its steps', async () => {
    const contact = await seedContact('happy');
    const workflow = await seedWorkflow({ source: 'manual' });
    const eventKey = workflowTriggerEventKey('domain', `test:${Date.now()}:${Math.random()}`);

    await withTransaction(dbHelper.pool, client => enqueueWorkflowTrigger(client, {
      contactId: contact.id,
      entityId: contact.id,
      entityType: 'contact',
      eventKey,
      organizationId: user.org.id,
      payload: { source: 'manual' },
      triggerType: 'contact_added',
    }));

    const triggerSummary = await runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 });
    expect(triggerSummary).toMatchObject({ claimed: 1, completed: 1, enrolled: 1 });

    const event = await dbHelper.pool.query(`
      SELECT status, attempt_count, result
      FROM workflow_triggers
      WHERE event_key = $1
    `, [eventKey]);
    expect(event.rows[0]).toMatchObject({
      status: 'completed',
      attempt_count: 1,
      result: expect.objectContaining({ enrolled: 1, matchedWorkflows: 1 }),
    });

    const enrollment = await dbHelper.pool.query(`
      SELECT status, next_action_at, trigger_data
      FROM workflow_enrollments
      WHERE workflow_id = $1 AND contact_id = $2
    `, [workflow.id, contact.id]);
    expect(enrollment.rows[0]).toMatchObject({
      status: 'active',
      trigger_data: expect.objectContaining({
        event_source: 'domain',
        source: 'manual',
        trigger_type: 'contact_added',
      }),
    });
    expect(enrollment.rows[0].next_action_at).toBeTruthy();

    const enrollmentSummary = await runWorkflowEnrollmentJobs(dbHelper.pool, { batchSize: 1 });
    expect(enrollmentSummary).toMatchObject({ claimed: 1, completed: 1 });
    const updatedContact = await dbHelper.pool.query(
      'SELECT tags FROM contacts WHERE id = $1',
      [contact.id]
    );
    expect(updatedContact.rows[0].tags).toContain('queue-processed');
  });

  test('rolls the workflow event back with its domain transaction', async () => {
    const eventKey = workflowTriggerEventKey('domain', `rollback:${Date.now()}:${Math.random()}`);
    await expect(withTransaction(dbHelper.pool, async client => {
      await enqueueWorkflowTrigger(client, {
        eventKey,
        organizationId: user.org.id,
        payload: {},
        triggerType: 'contact_added',
      });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    const event = await dbHelper.pool.query(
      'SELECT id FROM workflow_triggers WHERE event_key = $1',
      [eventKey]
    );
    expect(event.rows).toHaveLength(0);
  });

  test('allows only one competing worker to consume a queued event', async () => {
    const contact = await seedContact('concurrent');
    await seedWorkflow();
    const eventKey = workflowTriggerEventKey('domain', `concurrent:${Date.now()}:${Math.random()}`);
    await enqueueWorkflowTrigger(dbHelper.pool, {
      contactId: contact.id,
      eventKey,
      organizationId: user.org.id,
      payload: {},
      triggerType: 'contact_added',
    });

    const results = await Promise.all([
      runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 }),
      runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 }),
    ]);
    expect(results.reduce((total, result) => total + result.completed, 0)).toBe(1);

    const event = await dbHelper.pool.query(
      'SELECT status, attempt_count FROM workflow_triggers WHERE event_key = $1',
      [eventKey]
    );
    expect(event.rows[0]).toMatchObject({ status: 'completed', attempt_count: 1 });
  });

  test('recovers an expired trigger lease once', async () => {
    const contact = await seedContact('lease');
    await seedWorkflow();
    const eventKey = workflowTriggerEventKey('domain', `lease:${Date.now()}:${Math.random()}`);
    await enqueueWorkflowTrigger(dbHelper.pool, {
      contactId: contact.id,
      eventKey,
      organizationId: user.org.id,
      payload: {},
      triggerType: 'contact_added',
    });
    await dbHelper.pool.query(`
      UPDATE workflow_triggers
      SET status = 'processing',
          attempt_count = 1,
          lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE event_key = $1
    `, [eventKey]);

    const results = await Promise.all([
      runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 }),
      runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 }),
    ]);
    expect(results.reduce((total, result) => total + result.completed, 0)).toBe(1);

    const event = await dbHelper.pool.query(
      'SELECT status, attempt_count FROM workflow_triggers WHERE event_key = $1',
      [eventKey]
    );
    expect(event.rows[0]).toMatchObject({ status: 'completed', attempt_count: 2 });
  });

  test('recognizes a pre-upgrade webhook delivery that has no event key', async () => {
    const contact = await seedContact('legacy-webhook');
    const workflow = await seedWorkflow();
    const deliveryKey = `legacy-delivery-${Date.now()}-${Math.random()}`;
    const existing = (await dbHelper.pool.query(`
      INSERT INTO workflow_triggers (
        workflow_id, organization_id, contact_id, trigger_type,
        status, delivery_key, source, payload
      ) VALUES ($1, $2, $3, 'contact_added', 'queued', $4, 'webhook', '{}'::jsonb)
      RETURNING id
    `, [workflow.id, user.org.id, contact.id, deliveryKey])).rows[0];

    const replay = await enqueueWorkflowTrigger(dbHelper.pool, {
      contactId: contact.id,
      deliveryKey,
      eventKey: workflowTriggerEventKey('webhook', `${workflow.id}:${deliveryKey}`),
      organizationId: user.org.id,
      payload: {},
      source: 'webhook',
      triggerType: 'contact_added',
      workflowId: workflow.id,
    });
    expect(replay).toMatchObject({ id: existing.id, inserted: false });

    const deliveries = await dbHelper.pool.query(`
      SELECT COUNT(*)::integer AS count
      FROM workflow_triggers
      WHERE workflow_id = $1 AND delivery_key = $2
    `, [workflow.id, deliveryKey]);
    expect(deliveries.rows[0].count).toBe(1);
  });

  test('dispatches a due one-shot schedule exactly once across competing workers', async () => {
    const contact = await seedContact('scheduled');
    const scheduledAt = new Date(Date.now() - 60_000);
    const workflow = (await dbHelper.pool.query(`
      INSERT INTO workflows (
        organization_id, name, trigger_type, trigger_config, is_active,
        scheduled_contact_id, next_trigger_at, created_by
      ) VALUES (
        $1, $2, 'scheduled', $3::jsonb, true, $4, $5, $6
      )
      RETURNING *
    `, [
      user.org.id,
      `Scheduled workflow ${Date.now()}`,
      JSON.stringify({
        contact_id: contact.id,
        scheduled_at: scheduledAt.toISOString(),
      }),
      contact.id,
      scheduledAt,
      user.user.id,
    ])).rows[0];
    await dbHelper.pool.query(`
      INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
      VALUES ($1, 1, 'add_tag', '{"tag_name":"scheduled-processed"}'::jsonb)
    `, [workflow.id]);

    const results = await Promise.all([
      runScheduledWorkflowJobs(dbHelper.pool, { batchSize: 1 }),
      runScheduledWorkflowJobs(dbHelper.pool, { batchSize: 1 }),
    ]);
    expect(results.reduce((total, result) => total + result.queued, 0)).toBe(1);

    const persistedWorkflow = await dbHelper.pool.query(`
      SELECT next_trigger_at, last_triggered_at
      FROM workflows
      WHERE id = $1
    `, [workflow.id]);
    expect(persistedWorkflow.rows[0].next_trigger_at).toBeNull();
    expect(persistedWorkflow.rows[0].last_triggered_at).toBeTruthy();

    const event = await dbHelper.pool.query(`
      SELECT workflow_id, contact_id, trigger_type, status
      FROM workflow_triggers
      WHERE workflow_id = $1 AND trigger_type = 'scheduled'
    `, [workflow.id]);
    expect(event.rows).toEqual([
      expect.objectContaining({
        workflow_id: workflow.id,
        contact_id: contact.id,
        trigger_type: 'scheduled',
        status: 'queued',
      }),
    ]);

    const triggerSummary = await runWorkflowTriggerJobs(dbHelper.pool, { batchSize: 1 });
    expect(triggerSummary).toMatchObject({ claimed: 1, completed: 1, enrolled: 1 });
  });
});
