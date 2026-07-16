const {
  deliverWorkflowSideEffect,
  markWorkflowSideEffectFailure,
  quarantineExpiredSmsAttempts,
  redactWorkflowSideEffectError,
  workflowSideEffectBackoffMs,
} = require('../../jobs/workflow-side-effect-jobs');
const {
  WorkflowWebhookDeliveryError,
} = require('../../services/workflowWebhookEgress');

describe('workflow side-effect delivery contract', () => {
  const claim = {
    id: 7,
    idempotency_key: 'workflow-3-11-1704067200000',
    organization_id: 2,
    enrollment_id: 3,
    step_id: 11,
  };

  test('email delivery passes the stable outbox key to the provider', async () => {
    const sendEmail = jest.fn().mockResolvedValue({ success: true, id: 'email-1' });

    const result = await deliverWorkflowSideEffect({
      ...claim,
      effect_type: 'email',
      payload: {
        to: 'person@example.test',
        subject: 'Hello',
        bodyHtml: '<p>Hello</p>',
        bodyText: 'Hello',
      },
    }, { emailService: { sendEmail } });

    expect(result.id).toBe('email-1');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: claim.idempotency_key,
      to: 'person@example.test',
    }));
  });

  test('SMS delivery uses the snapshotted sender and content', async () => {
    const sendSms = jest.fn().mockResolvedValue({ success: true, id: 'sms-1' });

    await deliverWorkflowSideEffect({
      ...claim,
      effect_type: 'sms',
      payload: {
        from: '+16025550100',
        message: 'Hello',
        to: '+16025550101',
      },
    }, { smsService: { sendSms } });

    expect(sendSms).toHaveBeenCalledWith({
      from: '+16025550100',
      message: 'Hello',
      to: '+16025550101',
    });
  });

  test('expired SMS attempts are quarantined instead of automatically resent', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 19 }] }),
    };

    const count = await quarantineExpiredSmsAttempts(pool);

    expect(count).toBe(1);
    expect(pool.query.mock.calls[0][0]).toContain("status = 'reconciliation_required'");
    expect(pool.query.mock.calls[0][0]).toContain("effect_type = 'sms'");
    expect(pool.query.mock.calls[0][0]).toContain("status = 'processing'");
  });

  test('an ambiguous SMS provider failure requires reconciliation instead of retry', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ status: 'reconciliation_required' }],
      }),
    };
    const error = new Error('SmsService: Request timeout after 15000ms');
    error.providerOutcomeUnknown = true;

    const status = await markWorkflowSideEffectFailure(
      pool,
      { id: 20, attempt_count: 1, effect_type: 'sms' },
      error,
      { baseDelayMs: 1000, maxAttempts: 5, maxDelayMs: 5000 }
    );

    expect(status).toBe('reconciliation_required');
    expect(pool.query.mock.calls[0][0]).toContain("'provider_result_unknown'");
    expect(pool.query.mock.calls[0][1]).toEqual([
      20,
      1,
      'SmsService: Request timeout after 15000ms',
    ]);
  });

  test('webhook delivery enforces JSON and the stable idempotency header', async () => {
    const request = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'x-request-id': 'request-1' },
    });

    const result = await deliverWorkflowSideEffect({
      ...claim,
      effect_type: 'webhook',
      payload: {
        body: { event: 'workflow_step' },
        headers: { Authorization: 'Bearer secret' },
        method: 'POST',
        url: 'https://example.com/hook',
      },
    }, {
      httpClient: { request },
      lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
      webhookMaxRequestBytes: 4096,
      webhookMaxResponseBytes: 2048,
      webhookTimeoutMs: 500,
    });

    expect(result.id).toBe('request-1');
    const options = request.mock.calls[0][0];
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
      'Idempotency-Key': claim.idempotency_key,
    });
    expect(JSON.parse(options.data.toString())).toEqual({ event: 'workflow_step' });
    expect(options).toMatchObject({
      decompress: false,
      maxBodyLength: 4096,
      maxContentLength: 2048,
      maxRedirects: 0,
      proxy: false,
      timeout: 500,
    });
    expect(options.httpsAgent).toBeDefined();
  });

  test('non-retryable policy failures dead-letter immediately', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ status: 'dead_letter' }] }),
    };
    const error = new WorkflowWebhookDeliveryError(
      'Workflow webhook destination resolved to a prohibited address'
    );

    const status = await markWorkflowSideEffectFailure(
      pool,
      { id: 9, attempt_count: 1 },
      error,
      { baseDelayMs: 1000, maxAttempts: 5, maxDelayMs: 5000 }
    );

    expect(status).toBe('dead_letter');
    expect(pool.query.mock.calls[0][1][2]).toBe('dead_letter');
  });

  test('retry delays are bounded and stored errors redact recipients and secrets', () => {
    expect(workflowSideEffectBackoffMs(1, 1000, 5000)).toBe(1000);
    expect(workflowSideEffectBackoffMs(4, 1000, 5000)).toBe(5000);
    expect(redactWorkflowSideEffectError(
      new Error('person@example.test +16025550100 Bearer abc.def re_live_secret sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa https://example.test/hook?token=secret')
    )).toBe(
      '[redacted-email] [redacted-phone] [redacted-authorization] [redacted-secret] [redacted-signature] [redacted-url]'
    );
  });
});
