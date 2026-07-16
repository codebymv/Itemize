const {
  WorkflowWebhookDeliveryError,
  createPinnedLookup,
  deliverWorkflowWebhook,
  isPublicWebhookAddress,
  normalizeWorkflowWebhookHeaders,
  parseWorkflowWebhookUrl,
  resolveWorkflowWebhookAddresses,
  webhookStatusIsRetryable,
} = require('../../services/workflowWebhookEgress');

describe('workflow webhook controlled egress', () => {
  test('accepts only globally routable IP addresses', () => {
    expect(isPublicWebhookAddress('93.184.216.34')).toBe(true);
    expect(isPublicWebhookAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicWebhookAddress('127.0.0.1')).toBe(false);
    expect(isPublicWebhookAddress('169.254.169.254')).toBe(false);
    expect(isPublicWebhookAddress('100.64.0.1')).toBe(false);
    expect(isPublicWebhookAddress('192.0.2.1')).toBe(false);
    expect(isPublicWebhookAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicWebhookAddress('fc00::1')).toBe(false);
  });

  test('rejects local hostnames and credentials before DNS resolution', () => {
    expect(() => parseWorkflowWebhookUrl('https://service.internal/hook')).toThrow(
      'Workflow webhook URL is not allowed'
    );
    expect(() => parseWorkflowWebhookUrl('https://user:secret@example.com/hook')).toThrow(
      'Workflow webhook URL is not allowed'
    );
  });

  test('rejects the complete DNS answer when any address is prohibited', async () => {
    const target = new URL('https://mixed.example/hook');
    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(resolveWorkflowWebhookAddresses(target, lookup)).rejects.toMatchObject({
      message: 'Workflow webhook destination resolved to a prohibited address',
      retryable: false,
    });
  });

  test('DNS infrastructure failures remain bounded-retry failures', async () => {
    const failure = Object.assign(new Error('temporary DNS failure'), { code: 'EAI_AGAIN' });
    await expect(resolveWorkflowWebhookAddresses(
      new URL('https://example.com/hook'),
      jest.fn().mockRejectedValue(failure)
    )).rejects.toMatchObject({
      message: 'Workflow webhook DNS resolution failed',
      retryable: true,
    });
  });

  test('pinned lookup cannot resolve a redirected or substituted hostname', done => {
    const lookup = createPinnedLookup('example.com', [
      { address: '93.184.216.34', family: 4 },
    ]);

    lookup('other.example', {}, error => {
      expect(error).toMatchObject({ code: 'EACCES' });
      done();
    });
  });

  test('filters transport, forwarding, and tracing headers while preserving webhook auth', () => {
    expect(normalizeWorkflowWebhookHeaders({
      Authorization: 'Bearer tenant-secret',
      Baggage: 'spoofed',
      Host: 'internal',
      Origin: 'https://spoofed.example',
      'Sec-Fetch-Site': 'same-origin',
      Traceparent: 'spoofed',
      'User-Agent': 'spoofed',
      'X-Forwarded-For': '127.0.0.1',
      'X-Itemize-Trace': 'spoofed',
      'X-Request-Id': 'spoofed',
      'X-Webhook-Key': 'allowed',
    })).toEqual({
      Authorization: 'Bearer tenant-secret',
      'X-Webhook-Key': 'allowed',
    });
  });

  test('pins validated DNS, disables redirects and proxies, and caps both directions', async () => {
    const request = jest.fn().mockResolvedValue({
      status: 202,
      headers: { 'x-request-id': 'request-42' },
    });
    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);

    const result = await deliverWorkflowWebhook({
      body: { event: 'workflow_step' },
      headers: { Authorization: 'Bearer secret' },
      idempotencyKey: 'workflow-1-2-3',
      method: 'POST',
      url: 'https://example.com/hook',
    }, {
      httpClient: { request },
      lookup,
      maxRequestBytes: 4096,
      maxResponseBytes: 2048,
      timeoutMs: 750,
    });

    expect(result).toEqual({ success: true, id: 'request-42' });
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
    expect(request.mock.calls[0][0]).toMatchObject({
      decompress: false,
      maxBodyLength: 4096,
      maxContentLength: 2048,
      maxHeaderSize: 16384,
      maxRedirects: 0,
      method: 'POST',
      proxy: false,
      responseType: 'arraybuffer',
      timeout: 750,
      url: 'https://example.com/hook',
    });
    expect(request.mock.calls[0][0].headers).toMatchObject({
      'Accept-Encoding': 'identity',
      'Idempotency-Key': 'workflow-1-2-3',
      'User-Agent': 'Itemize-Workflow-Webhook/1.0',
      'X-Itemize-Delivery-Id': 'workflow-1-2-3',
    });
  });

  test('redirects and ordinary client errors are terminal policy failures', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    for (const status of [302, 400]) {
      await expect(deliverWorkflowWebhook({
        body: {},
        idempotencyKey: 'workflow-1-2-3',
        method: 'POST',
        url: 'https://example.com/hook',
      }, {
        httpClient: { request: jest.fn().mockResolvedValue({ status, headers: {} }) },
        lookup,
      })).rejects.toMatchObject({
        retryable: false,
      });
    }
  });

  test('timeouts, throttling, and server failures retain bounded retry semantics', async () => {
    expect(webhookStatusIsRetryable(408)).toBe(true);
    expect(webhookStatusIsRetryable(425)).toBe(true);
    expect(webhookStatusIsRetryable(429)).toBe(true);
    expect(webhookStatusIsRetryable(503)).toBe(true);
    expect(webhookStatusIsRetryable(409)).toBe(false);

    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    await expect(deliverWorkflowWebhook({
      body: {},
      idempotencyKey: 'workflow-1-2-3',
      method: 'POST',
      url: 'https://example.com/hook',
    }, {
      httpClient: { request: jest.fn().mockResolvedValue({ status: 503, headers: {} }) },
      lookup,
    })).rejects.toMatchObject({
      retryable: true,
    });
  });

  test('oversized requests and responses fail terminally without leaking targets', async () => {
    await expect(deliverWorkflowWebhook({
      body: { value: 'x'.repeat(2048) },
      idempotencyKey: 'workflow-1-2-3',
      method: 'POST',
      url: 'https://example.com/hook',
    }, {
      maxRequestBytes: 1024,
    })).rejects.toEqual(expect.objectContaining({
      message: 'Workflow webhook request exceeded the byte limit',
      retryable: false,
    }));

    const responseError = Object.assign(
      new Error('maxContentLength size of 1024 exceeded'),
      { code: 'ERR_BAD_RESPONSE' }
    );
    await expect(deliverWorkflowWebhook({
      body: {},
      idempotencyKey: 'workflow-1-2-3',
      method: 'POST',
      url: 'https://example.com/hook',
    }, {
      httpClient: { request: jest.fn().mockRejectedValue(responseError) },
      lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
      maxResponseBytes: 1024,
    })).rejects.toEqual(expect.objectContaining({
      message: 'Workflow webhook response exceeded the byte limit',
      retryable: false,
    }));
  });

  test('uses an explicit delivery error type for policy classification', () => {
    expect(new WorkflowWebhookDeliveryError('policy failure')).toMatchObject({
      retryable: false,
    });
  });
});
