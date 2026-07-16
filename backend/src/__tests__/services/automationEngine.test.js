const {
  AutomationEngine,
  workflowStepLogInput,
} = require('../../services/automationEngine');
const emailService = require('../../services/emailService');
const smsService = require('../../services/smsService');

describe('AutomationEngine execution contract', () => {
  afterEach(() => jest.restoreAllMocks());

  test('trigger conditions fail closed when required event data is absent', () => {
    const engine = new AutomationEngine({});

    expect(engine.checkTriggerConditions({ tag_name: 'vip' }, {})).toBe(false);
    expect(engine.checkTriggerConditions({ source: 'form' }, {})).toBe(false);
    expect(engine.checkTriggerConditions({ stage_id: 4 }, { newStageId: 4 })).toBe(true);
    expect(engine.checkTriggerConditions({ stage_id: 4 }, { newStageId: 5 })).toBe(false);
    expect(engine.checkTriggerConditions({ pipeline_id: 2 }, { deal: { pipeline_id: 2 } })).toBe(true);
    expect(engine.checkTriggerConditions({ form_id: 9 }, { form: { id: 9 } })).toBe(true);
  });

  test('releases its database client when trigger lookup fails', async () => {
    const client = {
      query: jest.fn().mockRejectedValue(new Error('lookup failed')),
      release: jest.fn(),
    };
    const engine = new AutomationEngine({ connect: jest.fn().mockResolvedValue(client) });

    const result = await engine.handleTrigger('contact_added', {
      contact: { id: 1 },
      organizationId: 2,
    });

    expect(result).toMatchObject({ enrolled: 0, error: 'lookup failed' });
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('normalizes compatibility aliases and rejects unknown triggers before database access', async () => {
    const aliasClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(aliasClient) };
    const engine = new AutomationEngine(pool);

    await expect(engine.handleTrigger('contact_created', {
      contact: { id: 1 },
      organizationId: 2,
    })).resolves.toEqual({ enrolled: 0 });
    expect(aliasClient.query.mock.calls[0][1]).toEqual([2, 'contact_added']);

    const rejected = await engine.handleTrigger('invented_event', {
      contact: { id: 1 },
      organizationId: 2,
    });
    expect(rejected).toMatchObject({
      enrolled: 0,
      error: 'Unsupported workflow trigger type: invented_event',
    });
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  test('does not execute an enrollment already claimed by another worker', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const engine = new AutomationEngine({});

    const result = await engine.processEnrollment(client, 11);

    expect(result).toMatchObject({ success: false, claimed: true });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('email steps queue an immutable provider delivery without provider I/O', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 7, subject: 'Hi', body_html: '<p>Hi</p>' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 19, idempotency_key: 'workflow-3-11-1704067200000', status: 'queued' }],
        }),
    };
    const send = jest.spyOn(emailService, 'sendEmail');
    const engine = new AutomationEngine({});

    const result = await engine.executeSendEmail(
      client,
      {
        id: 3,
        organization_id: 2,
        context: {},
        enrolled_at: '2024-01-01T00:00:00.000Z',
      },
      { id: 5, email: 'person@example.test' },
      { template_id: 7 },
      { id: 11 }
    );

    expect(result).toMatchObject({
      success: true,
      queued: true,
      outboxId: 19,
      idempotencyKey: 'workflow-3-11-1704067200000',
    });
    expect(send).not.toHaveBeenCalled();
    expect(client.query.mock.calls[1][0]).toContain('workflow_side_effect_outbox');
    const queuedPayload = JSON.parse(client.query.mock.calls[1][1][6]);
    expect(queuedPayload).toMatchObject({
      contactId: 5,
      subject: 'Hi',
      templateId: 7,
      to: 'person@example.test',
    });
  });

  test('contact and deal mutations include the workflow organization boundary', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const engine = new AutomationEngine({});
    const enrollment = { organization_id: 42, contact_id: 8 };

    await engine.executeAddTag(client, enrollment, { id: 8, tags: [] }, { tag_name: 'vip' });
    const moveResult = await engine.executeMoveDeal(client, enrollment, { deal_id: 91, stage_id: 4 });

    expect(client.query.mock.calls[0][0]).toContain('organization_id = $3');
    expect(client.query.mock.calls[0][1]).toEqual(['vip', 8, 42]);
    expect(client.query.mock.calls[1][0]).toContain('organization_id = $3');
    expect(client.query.mock.calls[1][1]).toEqual([4, 91, 42]);
    expect(moveResult).toMatchObject({ success: false, error: 'Deal not found in workflow organization' });
  });

  test('SMS steps snapshot an organization-owned sender without provider I/O', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ phone_number: '+16025550100' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 29, idempotency_key: 'workflow-4-13-1704067200000', status: 'queued' }],
        }),
    };
    const send = jest.spyOn(smsService, 'sendSms');
    const engine = new AutomationEngine({});

    const result = await engine.executeSendSms(
      client,
      {
        id: 4,
        organization_id: 2,
        enrolled_at: '2024-01-01T00:00:00.000Z',
      },
      { id: 6, phone: '(602) 555-0101', first_name: 'Person' },
      { message: 'Hello {{first_name}}' },
      { id: 13 }
    );

    expect(result).toMatchObject({ success: true, queued: true, outboxId: 29 });
    expect(send).not.toHaveBeenCalled();
    expect(client.query.mock.calls[0][0]).toContain('sms_receiving_numbers');
    expect(JSON.parse(client.query.mock.calls[1][1][6])).toMatchObject({
      contactId: 6,
      from: '+16025550100',
      message: 'Hello Person',
      to: '+16025550101',
    });
  });

  test('task assignment requires membership in the workflow organization', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const engine = new AutomationEngine({});

    const result = await engine.executeCreateTask(
      client,
      { organization_id: 12 },
      { id: 3 },
      { title: 'Follow up', assigned_to: 99 }
    );

    expect(client.query.mock.calls[0][0]).toContain('organization_members');
    expect(result).toMatchObject({
      success: false,
      error: 'Assigned user is not a member of the workflow organization',
    });
  });

  test('webhook steps require safe HTTPS and protect envelope fields', async () => {
    const engine = new AutomationEngine({});
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const fetchSpy = jest.spyOn(global, 'fetch');
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 23, idempotency_key: 'workflow-2-12-1704067200000', status: 'queued' }],
      }),
    };
    const enrollment = {
      id: 2,
      workflow_id: 4,
      organization_id: 6,
      enrolled_at: '2024-01-01T00:00:00.000Z',
    };
    const step = { id: 12 };

    try {
      const rejected = await engine.executeWebhook(
        client,
        enrollment,
        { id: 8 },
        { url: 'http://127.0.0.1/internal' },
        step
      );
      expect(rejected.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();

      const accepted = await engine.executeWebhook(
        client,
        enrollment,
        { id: 8, email: 'person@example.test' },
        {
          url: 'https://example.com/hook',
          custom_payload: { event: 'spoofed', enrollment_id: 999, custom: true },
          headers: {
            Authorization: 'Bearer tenant-secret',
            'Content-Type': 'text/plain',
            'Idempotency-Key': 'spoofed',
          },
        },
        step
      );
      expect(accepted).toMatchObject({ success: true, queued: true, outboxId: 23 });
      expect(fetchSpy).not.toHaveBeenCalled();
      const payload = JSON.parse(client.query.mock.calls[0][1][6]);
      expect(payload.body).toMatchObject({
        event: 'workflow_step',
        enrollment_id: 2,
        workflow_id: 4,
        custom: true,
      });
      expect(payload.headers).toEqual({ Authorization: 'Bearer tenant-secret' });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('invalid waits and condition operators fail explicitly', () => {
    const engine = new AutomationEngine({});

    expect(engine.executeWait({ delay_minutes: -1 })).toMatchObject({ success: false });
    expect(engine.executeWait({ delay_minutes: 'not-a-number' })).toMatchObject({ success: false });
    expect(engine.executeCondition({}, { status: 'active' }, {}, {
      field: 'status',
      operator: 'invented',
      value: 'active',
    })).toMatchObject({ success: false, error: 'Unsupported condition operator: invented' });
  });

  test('execution-log inputs omit provider payload values and secrets', () => {
    expect(workflowStepLogInput({
      step_type: 'webhook',
      step_config: {
        custom_payload: { secret: 'private' },
        headers: { Authorization: 'Bearer private' },
        url: 'https://example.test/hook?token=private',
      },
    })).toEqual({
      step_type: 'webhook',
      config_keys: ['custom_payload', 'headers', 'url'],
    });
  });
});
