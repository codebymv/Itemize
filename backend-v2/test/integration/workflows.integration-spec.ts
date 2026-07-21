import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { WorkflowTriggerJobsRepository } from '../../src/workflow-jobs/workflow-trigger-jobs.repository';
import { WorkflowTriggerJobsService } from '../../src/workflow-jobs/workflow-trigger-jobs.service';

describe('Workflow definitions GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let workflowJobs: WorkflowTriggerJobsService;
  let workflowJobRepository: WorkflowTriggerJobsRepository;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for workflow tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Workflow Member', 'email', true), ($2, 'Workflow Outsider', 'email', true)
       RETURNING id`,
      [`workflow-member-${suffix}@test.itemize`, `workflow-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, workflows_limit)
       VALUES ('Workflow Primary', $1, -1), ('Workflow Other', $2, -1) RETURNING id`,
      [`workflow-primary-${suffix}`, `workflow-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id = CASE id WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id = ANY($5::int[])`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId, [memberId, outsiderId]],
    );
    memberToken = await jwt.signAsync({ id: memberId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(pool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    workflowJobs = app.get(WorkflowTriggerJobsService);
    workflowJobRepository = app.get(WorkflowTriggerJobsRepository);

  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [[organizationId, outsiderOrganizationId].filter(Boolean)]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [[memberId, outsiderId].filter(Boolean)]);
    }
    if (app) await app.close();
  });

  const graphql = (token: string, orgId: number, document: string, variables: Record<string, unknown> = {}, csrf = true) => {
    const call = request(app.getHttpServer()).post('/graphql')
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=workflow-csrf` : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'workflow-csrf');
    return call.send({ query: document, variables });
  };
  const fields = `id organizationId name description triggerType triggerConfig scheduledContactId nextTriggerAt
    lastTriggeredAt isActive stats createdById createdByName createdAt updatedAt stepCount activeEnrollments
    affectedEnrollments enrollmentStats { activeCount completedCount failedCount totalCount }
    steps { id workflowId stepOrder stepType stepConfig conditionConfig trueBranchStep falseBranchStep }`;

  it('creates the retained ordered definition representation', async () => {
    const response = await graphql(memberToken, organizationId,
      `mutation Create($input: CreateWorkflowInput!) { createWorkflow(input: $input) { ${fields} } }`,
      { input: { name: ' Welcome ', triggerType: 'contact_created', triggerConfig: {}, steps: [
        { stepType: 'condition', stepConfig: {}, conditionConfig: { field: 'status' }, trueBranchStep: 2 },
        { stepType: 'add_tag', stepConfig: { tag_name: 'welcome' } },
      ] } }).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createWorkflow).toMatchObject({
      organizationId, name: 'Welcome', triggerType: 'contact_added', isActive: false, stepCount: 2,
      steps: [{ stepOrder: 1, trueBranchStep: 2 }, { stepOrder: 2, stepType: 'add_tag' }],
    });
    const id = Number(response.body.data.createWorkflow.id);
    const retained = await pool.query<{
      id: number; organization_id: number; trigger_type: string; step_orders: number[];
    }>(
      `SELECT w.id, w.organization_id, w.trigger_type,
         ARRAY_AGG(ws.step_order ORDER BY ws.step_order)::int[] AS step_orders
       FROM workflows w JOIN workflow_steps ws ON ws.workflow_id = w.id
       WHERE w.id = $1 GROUP BY w.id`, [id],
    );
    expect(retained.rows[0]).toMatchObject({
      id, organization_id: organizationId, trigger_type: 'contact_added', step_orders: [1, 2],
    });
  });

  it('preserves omitted steps and atomically replaces explicit steps, including an empty list', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, trigger_type, created_by) VALUES ($1, 'Replace', 'manual', $2) RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    await pool.query(
      `INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
       VALUES ($1, 1, 'add_tag', '{}'), ($1, 2, 'wait', '{}')`, [id],
    );
    const mutation = `mutation Update($id: Int!, $input: UpdateWorkflowInput!) { updateWorkflow(id: $id, input: $input) { ${fields} } }`;
    const preserved = await graphql(memberToken, organizationId, mutation, { id, input: { name: 'Renamed' } }).expect(200);
    expect(preserved.body.data.updateWorkflow.steps).toHaveLength(2);
    const replaced = await graphql(memberToken, organizationId, mutation, {
      id, input: { steps: [{ stepType: 'send_email', stepConfig: { subject: 'Hello' } }] },
    }).expect(200);
    expect(replaced.body.data.updateWorkflow.steps).toEqual([expect.objectContaining({ stepOrder: 1, stepType: 'send_email' })]);
    const cleared = await graphql(memberToken, organizationId, mutation, { id, input: { steps: [] } }).expect(200);
    expect(cleared.body.data.updateWorkflow.steps).toEqual([]);
    expect(cleared.body.data.updateWorkflow.stepCount).toBe(0);
  });

  it('filters and stably pages tenant definitions and rejects activation without steps', async () => {
    const prefix = `Paged ${Date.now()}`;
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, description, trigger_type, is_active, created_by, updated_at)
       VALUES ($1, $2, 'needle', 'manual', false, $4, '2026-07-21T10:00:00Z'),
              ($1, $3, 'needle', 'manual', false, $4, '2026-07-21T10:00:00Z')
       RETURNING id`, [organizationId, `${prefix} A`, `${prefix} B`, memberId],
    );
    const listed = await graphql(memberToken, organizationId,
      `query List($filter: WorkflowFilterInput, $page: PageInput) {
        workflows(filter: $filter, page: $page) {
          nodes { id name triggerType isActive stepCount }
          pageInfo { page pageSize total hasNextPage }
        }
      }`, { filter: { triggerType: 'manual', isActive: false, search: prefix }, page: { page: 1, pageSize: 1 } }, false).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.workflows.pageInfo).toEqual({ page: 1, pageSize: 1, total: 2, hasNextPage: true });
    expect(listed.body.data.workflows.nodes).toHaveLength(1);
    expect(listed.body.data.workflows.nodes[0].id).toBe(Math.max(...inserted.rows.map((row) => Number(row.id))));

    const noSteps = Number(inserted.rows[0].id);
    const denied = await graphql(memberToken, organizationId,
      'mutation Activate($id: Int!) { activateWorkflow(id: $id) { id } }', { id: noSteps }).expect(200);
    expect(denied.body.errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', reason: 'WORKFLOW_HAS_NO_STEPS' });
  });

  it('validates tenant-owned schedules and duplicates the full definition inactive', async () => {
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, email, created_by)
       VALUES ($1, 'Local', $3, $5), ($2, 'Foreign', $4, $6) RETURNING id`,
      [organizationId, outsiderOrganizationId, `local-${Date.now()}@test.itemize`,
        `foreign-${Date.now()}@test.itemize`, memberId, outsiderId],
    );
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    const create = `mutation Create($input: CreateWorkflowInput!) { createWorkflow(input: $input) { ${fields} } }`;
    const denied = await graphql(memberToken, organizationId, create, { input: {
      name: 'Foreign', triggerType: 'scheduled',
      triggerConfig: { contact_id: contacts.rows[1].id, scheduled_at: scheduledAt }, steps: [],
    } }).expect(200);
    expect(denied.body.errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', reason: 'INVALID_WORKFLOW_SCHEDULE' });
    const created = await graphql(memberToken, organizationId, create, { input: {
      name: 'Scheduled', triggerType: 'scheduled',
      triggerConfig: { contact_id: contacts.rows[0].id, scheduled_at: scheduledAt },
      steps: [{ stepType: 'wait', stepConfig: { delay_hours: 1 } }],
    } }).expect(200);
    const id = Number(created.body.data.createWorkflow.id);
    const duplicated = await graphql(memberToken, organizationId,
      `mutation Duplicate($id: Int!) { duplicateWorkflow(id: $id) { ${fields} } }`, { id }).expect(200);
    expect(duplicated.body.data.duplicateWorkflow).toMatchObject({
      name: 'Scheduled (Copy)', isActive: false, scheduledContactId: Number(contacts.rows[0].id), stepCount: 1,
    });
  });

  it('deactivates active enrollments and only resumes deactivation-paused rows', async () => {
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, email, created_by)
       VALUES ($1, 'Lifecycle', $2, $3) RETURNING id`,
      [organizationId, `lifecycle-${Date.now()}@test.itemize`, memberId],
    );
    const workflow = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, trigger_type, is_active, created_by)
       VALUES ($1, 'Lifecycle', 'manual', true, $2) RETURNING id`, [organizationId, memberId],
    );
    const id = Number(workflow.rows[0].id);
    await pool.query(`INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config) VALUES ($1, 1, 'wait', '{}')`, [id]);
    await pool.query(
      `INSERT INTO workflow_enrollments (workflow_id, contact_id, status, current_step, trigger_data, context, next_action_at)
       VALUES ($1, $2, 'active', 1, '{}', '{}', NOW())`, [id, contact.rows[0].id],
    );
    const deactivated = await graphql(memberToken, organizationId,
      `mutation Deactivate($id: Int!) { deactivateWorkflow(id: $id) { ${fields} } }`, { id }).expect(200);
    expect(deactivated.body.data.deactivateWorkflow).toMatchObject({ isActive: false, affectedEnrollments: 1, activeEnrollments: 0 });
    const activated = await graphql(memberToken, organizationId,
      `mutation Activate($id: Int!) { activateWorkflow(id: $id) { ${fields} } }`, { id }).expect(200);
    expect(activated.body.data.activateWorkflow).toMatchObject({ isActive: true, affectedEnrollments: 1, activeEnrollments: 1 });
  });

  it('conceals foreign IDs, requires CSRF, rejects invalid branches, and serializes plan limits', async () => {
    const foreign = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, trigger_type, created_by)
       VALUES ($1, 'Foreign', 'manual', $2) RETURNING id`, [outsiderOrganizationId, outsiderId],
    );
    const hidden = await graphql(memberToken, organizationId,
      `query Detail($id: Int!) { workflow(id: $id) { id } }`, { id: Number(foreign.rows[0].id) }, false).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const csrf = await graphql(memberToken, organizationId,
      'mutation Delete($id: Int!) { deleteWorkflow(id: $id) { success } }', { id: Number(foreign.rows[0].id) }, false).expect(200);
    expect(csrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const branch = await graphql(memberToken, organizationId,
      'mutation Create($input: CreateWorkflowInput!) { createWorkflow(input: $input) { id } }', { input: {
        name: 'Loop', triggerType: 'manual', triggerConfig: {},
        steps: [{ stepType: 'condition', stepConfig: {}, trueBranchStep: 1 }, { stepType: 'wait', stepConfig: {} }],
      } }).expect(200);
    expect(branch.body.errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', reason: 'INVALID_WORKFLOW_BRANCH' });

    await pool.query('DELETE FROM workflows WHERE organization_id = $1', [organizationId]);
    await pool.query('UPDATE organizations SET workflows_limit = 1 WHERE id = $1', [organizationId]);
    const document = 'mutation Create($input: CreateWorkflowInput!) { createWorkflow(input: $input) { id } }';
    const [first, second] = await Promise.all([
      graphql(memberToken, organizationId, document, { input: { name: 'One', triggerType: 'manual', steps: [] } }),
      graphql(memberToken, organizationId, document, { input: { name: 'Two', triggerType: 'manual', steps: [] } }),
    ]);
    const responses = [first.body, second.body];
    expect(responses.filter((body) => body.data?.createWorkflow)).toHaveLength(1);
    expect(responses.filter((body) => body.errors?.[0]?.extensions?.reason === 'PLAN_LIMIT_REACHED')).toHaveLength(1);
    await pool.query('UPDATE organizations SET workflows_limit = -1 WHERE id = $1', [organizationId]);
  });

  it('manages enrollment state without crossing tenants or losing current-step progress', async () => {
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email, company, created_by)
       VALUES ($1, 'Local', 'Contact', $3, 'Itemize', $5),
              ($2, 'Foreign', 'Contact', $4, 'Other', $6)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, `enrollment-local-${Date.now()}@test.itemize`,
        `enrollment-foreign-${Date.now()}@test.itemize`, memberId, outsiderId],
    );
    const workflow = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, trigger_type, is_active, created_by)
       VALUES ($1, 'Enrollment lifecycle', 'manual', true, $2) RETURNING id`,
      [organizationId, memberId],
    );
    const workflowId = Number(workflow.rows[0].id);
    const steps = await pool.query<{ id: number }>(
      `INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
       VALUES ($1, 1, 'wait', '{}'), ($1, 2, 'add_tag', '{"tag_name":"done"}') RETURNING id`,
      [workflowId],
    );
    const enroll = `mutation Enroll($workflowId: Int!, $input: EnrollContactInWorkflowInput!) {
      enrollContactInWorkflow(workflowId: $workflowId, input: $input) {
        id workflowId contactId currentStep status triggerData context firstName lastName email company
      }
    }`;

    const [first, second] = await Promise.all([
      graphql(memberToken, organizationId, enroll, {
        workflowId, input: { contactId: Number(contacts.rows[0].id), triggerData: { source: 'manual' } },
      }),
      graphql(memberToken, organizationId, enroll, {
        workflowId, input: { contactId: Number(contacts.rows[0].id), triggerData: { source: 'duplicate' } },
      }),
    ]);
    const results = [first.body, second.body];
    expect(results.filter((body) => body.data?.enrollContactInWorkflow)).toHaveLength(1);
    expect(results.filter((body) => body.errors?.[0]?.extensions?.reason === 'WORKFLOW_ENROLLMENT_CONFLICT')).toHaveLength(1);
    const enrollment = results.find((body) => body.data?.enrollContactInWorkflow)?.data.enrollContactInWorkflow;
    expect(enrollment).toMatchObject({
      workflowId, contactId: Number(contacts.rows[0].id), currentStep: 1, status: 'active',
      triggerData: expect.objectContaining({ source: expect.any(String) }), firstName: null,
    });
    const enrollmentId = Number(enrollment.id);

    const foreignContact = await graphql(memberToken, organizationId, enroll, {
      workflowId, input: { contactId: Number(contacts.rows[1].id) },
    }).expect(200);
    expect(foreignContact.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const listed = await graphql(memberToken, organizationId,
      `query Enrollments($workflowId: Int!, $filter: WorkflowEnrollmentFilterInput, $page: PageInput) {
        workflowEnrollments(workflowId: $workflowId, filter: $filter, page: $page) {
          nodes { id workflowId contactId status firstName email }
          pageInfo { page pageSize total totalPages hasNextPage }
        }
      }`, { workflowId, filter: { status: 'active' }, page: { page: 1, pageSize: 1 } }, false).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.workflowEnrollments).toMatchObject({
      nodes: [{ id: enrollmentId, workflowId, contactId: Number(contacts.rows[0].id), status: 'active', firstName: 'Local' }],
      pageInfo: { page: 1, pageSize: 1, total: 1, totalPages: 1, hasNextPage: false },
    });

    const lifecycle = (operation: string) => graphql(memberToken, organizationId,
      `mutation EnrollmentLifecycle($workflowId: Int!, $enrollmentId: Int!) {
        ${operation}(workflowId: $workflowId, enrollmentId: $enrollmentId) {
          id currentStep status pauseReason executionAttemptCount affectedSideEffects
        }
      }`, { workflowId, enrollmentId });
    const paused = await lifecycle('pauseWorkflowEnrollment').expect(200);
    expect(paused.body.data.pauseWorkflowEnrollment).toMatchObject({ status: 'paused', pauseReason: 'manual' });
    await graphql(memberToken, organizationId,
      'mutation Activate($id: Int!) { activateWorkflow(id: $id) { id affectedEnrollments } }',
      { id: workflowId }).expect(200);
    const stillPaused = await pool.query<{ status: string; pause_reason: string }>(
      'SELECT status, pause_reason FROM workflow_enrollments WHERE id = $1', [enrollmentId],
    );
    expect(stillPaused.rows[0]).toMatchObject({ status: 'paused', pause_reason: 'manual' });
    const resumed = await lifecycle('resumeWorkflowEnrollment').expect(200);
    expect(resumed.body.data.resumeWorkflowEnrollment).toMatchObject({ status: 'active', pauseReason: null });

    await pool.query(
      `UPDATE workflow_enrollments SET status = 'failed', current_step = 2,
         error_message = 'provider timeout', execution_attempt_count = 4, next_action_at = NULL
       WHERE id = $1`, [enrollmentId],
    );
    const retried = await lifecycle('retryWorkflowEnrollment').expect(200);
    expect(retried.body.data.retryWorkflowEnrollment).toMatchObject({
      status: 'active', currentStep: 2, executionAttemptCount: 0,
    });

    const runAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO workflow_side_effect_outbox (
         idempotency_key, organization_id, enrollment_id, step_id, enrollment_run_at,
         effect_type, payload, status, next_attempt_at, lease_expires_at
       ) VALUES
         ($1, $3, $4, $5, $7, 'email', '{}', 'queued', NOW(), NULL),
         ($2, $3, $4, $6, $7, 'sms', '{}', 'processing', NOW(), NOW() + INTERVAL '5 minutes')`,
      [`enrollment-queued-${Date.now()}`, `enrollment-processing-${Date.now()}`, organizationId,
        enrollmentId, Number(steps.rows[0].id), Number(steps.rows[1].id), runAt],
    );
    const cancelled = await lifecycle('cancelWorkflowEnrollment').expect(200);
    expect(cancelled.body.data.cancelWorkflowEnrollment).toMatchObject({ status: 'cancelled', affectedSideEffects: 2 });
    const outbox = await pool.query<{ status: string; cancellation_reason: string; cancelled_at: Date | null }>(
      `SELECT status, cancellation_reason, cancelled_at FROM workflow_side_effect_outbox
       WHERE enrollment_id = $1 ORDER BY id`, [enrollmentId],
    );
    expect(outbox.rows).toEqual([
      expect.objectContaining({ status: 'cancelled', cancellation_reason: 'enrollment_cancelled', cancelled_at: expect.any(Date) }),
      expect.objectContaining({ status: 'processing', cancellation_reason: 'enrollment_cancelled', cancelled_at: expect.any(Date) }),
    ]);

    const reenrolled = await graphql(memberToken, organizationId, enroll, {
      workflowId, input: { contactId: Number(contacts.rows[0].id), triggerData: { source: 'reenroll' } },
    }).expect(200);
    expect(reenrolled.body.data.enrollContactInWorkflow).toMatchObject({
      id: enrollmentId, status: 'active', currentStep: 1, triggerData: { source: 'reenroll' }, context: {},
    });

    const hidden = await graphql(outsiderToken, outsiderOrganizationId,
      'query Enrollments($workflowId: Int!) { workflowEnrollments(workflowId: $workflowId) { nodes { id } } }',
      { workflowId }, false).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const noCsrf = await graphql(memberToken, organizationId,
      `mutation Pause($workflowId: Int!, $enrollmentId: Int!) {
        pauseWorkflowEnrollment(workflowId: $workflowId, enrollmentId: $enrollmentId) { id }
      }`, { workflowId, enrollmentId }, false).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('exposes a payload-free operator queue and performs scoped retry and SMS reconciliation', async () => {
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email, phone, created_by)
       VALUES ($1, 'Queue', 'Operator', $2, '+15205550123', $3) RETURNING id`,
      [organizationId, `queue-${Date.now()}@test.itemize`, memberId],
    );
    const workflow = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id, name, trigger_type, is_active, created_by)
       VALUES ($1, 'Execution operator', 'manual', true, $2) RETURNING id`, [organizationId, memberId],
    );
    const workflowId = Number(workflow.rows[0].id);
    const steps = await pool.query<{ id: number }>(
      `INSERT INTO workflow_steps (workflow_id, step_order, step_type, step_config)
       VALUES ($1,1,'send_email','{}'),($1,2,'send_sms','{}'),($1,3,'webhook','{}') RETURNING id`, [workflowId],
    );
    const enrollment = await pool.query<{ id: number }>(
      `INSERT INTO workflow_enrollments (workflow_id,contact_id,status,current_step,trigger_data,context,next_action_at)
       VALUES ($1,$2,'active',2,'{}','{}',NOW()-INTERVAL '2 minutes') RETURNING id`,
      [workflowId, Number(contact.rows[0].id)],
    );
    const enrollmentId = Number(enrollment.rows[0].id);
    const runAt = new Date(Date.now() - 300_000).toISOString();
    const inserted = await pool.query<{ id: number; status: string }>(
      `INSERT INTO workflow_side_effect_outbox (idempotency_key,organization_id,enrollment_id,step_id,
         enrollment_run_at,effect_type,payload,status,attempt_count,next_attempt_at,last_error,
         operator_retry_count,reconciliation_required_at,reconciliation_reason)
       VALUES
         ($1,$4,$5,$6,$9,'email','{"to":"secret@example.com"}','dead_letter',3,NULL,
          'Bearer hidden https://private.example secret@example.com',2,NULL,NULL),
         ($2,$4,$5,$7,$9,'sms',$10::jsonb,'reconciliation_required',1,NULL,'timeout',0,NOW(),'ambiguous_timeout'),
         ($3,$4,$5,$8,$9,'webhook','{"url":"https://private.example"}','queued',0,NOW()-INTERVAL '1 minute',NULL,0,NULL,NULL)
       RETURNING id,status`,
      [`operator-email-${Date.now()}`, `operator-sms-${Date.now()}`, `operator-webhook-${Date.now()}`,
        organizationId, enrollmentId, Number(steps.rows[0].id), Number(steps.rows[1].id), Number(steps.rows[2].id),
        runAt, JSON.stringify({ contactId: Number(contact.rows[0].id), to: '+15205550123', from: '+15205550124', message: 'Hello', segments: 1 })],
    );
    const deadLetterId = Number(inserted.rows.find((row) => row.status === 'dead_letter')?.id);
    const smsId = Number(inserted.rows.find((row) => row.status === 'reconciliation_required')?.id);

    const summary = await graphql(memberToken, organizationId,
      `query Summary($workflowId:Int!){ workflowExecutionSummary(workflowId:$workflowId){
        workflowId sideEffects { total dueCount expiredProcessingCount maxAttemptCount totalAttemptCount operatorRetryCount
          byStatus { queued processing retry sent deadLetter cancelled reconciliationRequired }
          byType { email sms webhook } oldestPendingAt }
        enrollments { total active paused completed failed cancelled oldestDueAt oldestDueAgeSeconds }
      } }`, { workflowId }, false).expect(200);
    expect(summary.body.errors).toBeUndefined();
    expect(summary.body.data.workflowExecutionSummary).toMatchObject({
      workflowId,
      sideEffects: { total: 3, dueCount: 1, maxAttemptCount: 3, totalAttemptCount: 4, operatorRetryCount: 2,
        byStatus: { queued: 1, deadLetter: 1, reconciliationRequired: 1 }, byType: { email: 1, sms: 1, webhook: 1 } },
      enrollments: { total: 1, active: 1, paused: 0, completed: 0, failed: 0, cancelled: 0 },
    });

    const list = await graphql(memberToken, organizationId,
      `query SideEffects($workflowId:Int!,$filter:WorkflowSideEffectFilterInput,$page:PageInput){
        workflowSideEffects(workflowId:$workflowId,filter:$filter,page:$page){
          nodes { id enrollmentId stepOrder effectType status attemptCount operatorRetryCount providerId lastError
            isDue leaseExpired ageSeconds enrollmentStatus enrollmentCurrentStep contactId contactName }
          pageInfo { page pageSize total totalPages }
        }
      }`, { workflowId, filter: { status: 'dead_letter', effectType: 'email' }, page: { page: 1, pageSize: 1 } }, false).expect(200);
    expect(list.body.errors).toBeUndefined();
    expect(list.body.data.workflowSideEffects).toMatchObject({
      nodes: [{ id: deadLetterId, enrollmentId, stepOrder: 1, effectType: 'email', status: 'dead_letter',
        attemptCount: 3, operatorRetryCount: 2, contactName: 'Queue Operator' }],
      pageInfo: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    });
    const safeError = list.body.data.workflowSideEffects.nodes[0].lastError;
    expect(safeError).toContain('[redacted-authorization]');
    expect(safeError).toContain('[redacted-url]');
    expect(safeError).toContain('[redacted-email]');
    expect(JSON.stringify(list.body.data)).not.toContain('private.example');

    const payloadDenied = await graphql(memberToken, organizationId,
      'query Hidden($workflowId:Int!){ workflowSideEffects(workflowId:$workflowId){ nodes { id payload } } }',
      { workflowId }, false).expect(400);
    expect(payloadDenied.body.errors[0].message).toContain('Cannot query field');

    const retry = await graphql(memberToken, organizationId,
      `mutation Retry($workflowId:Int!,$sideEffectId:Int!){ retryWorkflowSideEffect(workflowId:$workflowId,sideEffectId:$sideEffectId){
        id status attemptCount operatorRetryCount nextAttemptAt }
      }`, { workflowId, sideEffectId: deadLetterId }).expect(200);
    expect(retry.body.data.retryWorkflowSideEffect).toMatchObject({ id: deadLetterId, status: 'retry', attemptCount: 0, operatorRetryCount: 3 });

    const sid = 'SM00000000000000000000000000000000';
    const reconciled = await graphql(memberToken, organizationId,
      `mutation Reconcile($workflowId:Int!,$sideEffectId:Int!,$input:ReconcileWorkflowSmsSideEffectInput!){
        reconcileWorkflowSmsSideEffect(workflowId:$workflowId,sideEffectId:$sideEffectId,input:$input){
          id status providerId lastReconciliationAction lastReconciledBy }
      }`, { workflowId, sideEffectId: smsId, input: { action: 'accepted', providerId: sid } }).expect(200);
    expect(reconciled.body.data.reconcileWorkflowSmsSideEffect).toMatchObject({
      id: smsId, status: 'sent', providerId: sid, lastReconciliationAction: 'accepted', lastReconciledBy: memberId,
    });
    const smsLog = await pool.query<{ external_id: string; workflow_side_effect_id: number }>(
      'SELECT external_id,workflow_side_effect_id FROM sms_logs WHERE workflow_side_effect_id=$1', [smsId],
    );
    expect(smsLog.rows).toEqual([{ external_id: sid, workflow_side_effect_id: String(smsId) }]);

    const hidden = await graphql(outsiderToken, outsiderOrganizationId,
      'query Summary($workflowId:Int!){ workflowExecutionSummary(workflowId:$workflowId){ workflowId } }',
      { workflowId }, false).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const noCsrf = await graphql(memberToken, organizationId,
      'mutation Retry($workflowId:Int!,$sideEffectId:Int!){ retryWorkflowSideEffect(workflowId:$workflowId,sideEffectId:$sideEffectId){ id } }',
      { workflowId, sideEffectId: deadLetterId }, false).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('dispatches a due schedule and fans out its trigger exactly once under contention', async () => {
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id,first_name,last_name,email,created_by)
       VALUES ($1,'Scheduled','Contact',$2,$3) RETURNING id`,
      [organizationId, `scheduled-${Date.now()}@test.itemize`, memberId],
    );
    const contactId = Number(contact.rows[0].id);
    const scheduledAt = new Date(Date.now() - 60_000);
    const workflow = await pool.query<{ id: number }>(
      `INSERT INTO workflows (organization_id,name,trigger_type,trigger_config,is_active,scheduled_contact_id,
         next_trigger_at,created_by,stats)
       VALUES ($1,'Contended schedule','scheduled','{}',true,$2,$3,$4,'{}') RETURNING id`,
      [organizationId, contactId, scheduledAt, memberId],
    );
    const workflowId = Number(workflow.rows[0].id);

    const scheduleRuns = await Promise.all([
      workflowJobs.runScheduled({ batchSize: 1 }),
      workflowJobs.runScheduled({ batchSize: 1 }),
    ]);
    expect(scheduleRuns.reduce((total, run) => total + run.claimed, 0)).toBe(1);
    const queued = await pool.query<{ id: number; event_key: string; status: string }>(
      `SELECT id,event_key,status FROM workflow_triggers WHERE workflow_id=$1`, [workflowId],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]).toMatchObject({
      event_key: `domain:scheduled:${workflowId}:${scheduledAt.toISOString()}`,
      status: 'queued',
    });

    const triggerRuns = await Promise.all([
      workflowJobs.runTriggers({ batchSize: 1 }),
      workflowJobs.runTriggers({ batchSize: 1 }),
    ]);
    expect(triggerRuns.reduce((total, run) => total + run.claimed, 0)).toBe(1);
    expect(triggerRuns.reduce((total, run) => total + run.enrolled, 0)).toBe(1);
    const retained = await pool.query<{
      trigger_status: string; enrollment_count: string; enrolled_stat: string; next_trigger_at: Date | null;
    }>(
      `SELECT t.status AS trigger_status,
         (SELECT COUNT(*) FROM workflow_enrollments e WHERE e.workflow_id=w.id)::text AS enrollment_count,
         COALESCE(w.stats->>'enrolled','0') AS enrolled_stat,w.next_trigger_at
       FROM workflows w JOIN workflow_triggers t ON t.workflow_id=w.id WHERE w.id=$1`, [workflowId],
    );
    expect(retained.rows[0]).toMatchObject({
      trigger_status: 'completed', enrollment_count: '1', enrolled_stat: '1', next_trigger_at: null,
    });
  });

  it('recovers expired work with attempt fencing and redacted dead-letter evidence', async () => {
    const trigger = await pool.query<{ id: number }>(
      `INSERT INTO workflow_triggers (organization_id,contact_id,trigger_type,payload,status,event_key,source,
         attempt_count,next_attempt_at,lease_expires_at)
       VALUES ($1,NULL,'contact_added','{}','processing',$2,'domain',0,NOW()-INTERVAL '2 minutes',
         NOW()-INTERVAL '1 minute') RETURNING id`,
      [organizationId, `domain:test-fencing:${Date.now()}`],
    );
    const triggerId = Number(trigger.rows[0].id);
    const first = await workflowJobRepository.claimTrigger(30, triggerId);
    expect(first).toMatchObject({ id: triggerId, status: 'processing', attempt_count: 1 });
    expect(await workflowJobRepository.failTrigger(first!, new Error(
      'send secret@example.com +15551234567 with sk_live_supersecret',
    ), { maxAttempts: 2, baseDelayMs: 1, maximumDelayMs: 1 })).toBe('retry');

    await pool.query(`UPDATE workflow_triggers SET next_attempt_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [triggerId]);
    const second = await workflowJobRepository.claimTrigger(30, triggerId);
    expect(second).toMatchObject({ id: triggerId, attempt_count: 2 });
    await expect(workflowJobRepository.processTrigger(first!)).resolves.toMatchObject({
      persisted: false, skippedReason: 'stale_claim',
    });
    await expect(workflowJobRepository.failTrigger(first!, new Error('stale'), {
      maxAttempts: 2, baseDelayMs: 1, maximumDelayMs: 1,
    })).resolves.toBe('stale');
    expect(await workflowJobRepository.failTrigger(second!, new Error(
      'send secret@example.com +15551234567 with sk_live_supersecret',
    ), { maxAttempts: 2, baseDelayMs: 1, maximumDelayMs: 1 })).toBe('dead_letter');

    const retained = await pool.query<{
      status: string; attempt_count: number; last_error: string; next_attempt_at: Date | null; lease_expires_at: Date | null;
    }>('SELECT status,attempt_count,last_error,next_attempt_at,lease_expires_at FROM workflow_triggers WHERE id=$1', [triggerId]);
    expect(retained.rows[0]).toMatchObject({
      status: 'dead_letter', attempt_count: 2, next_attempt_at: null, lease_expires_at: null,
      last_error: 'send [redacted-email] [redacted-phone] with [redacted-secret]',
    });
  });
});
