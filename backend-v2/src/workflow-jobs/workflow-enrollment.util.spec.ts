import {
  normalizeWorkflowPhone,
  replaceWorkflowVariables,
  validWorkflowPhone,
  workflowConditionResult,
  workflowTemplateData,
  workflowWaitUntil,
  workflowWebhookHeaders,
  workflowWebhookUrl,
  wrapWorkflowEmail,
} from './workflow-enrollment.util';

describe('workflow enrollment utilities', () => {
  it('renders the retained flat workflow variables and context precedence', () => {
    const data = workflowTemplateData({
      first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test', custom_fields: { score: 7 },
    }, { score: 9, campaign: 'Summer' });
    expect(replaceWorkflowVariables('Hi {{first_name}} {{score}} {{campaign}} {{missing}}', data))
      .toBe('Hi Ada 9 Summer {{missing}}');
    expect(wrapWorkflowEmail('<p class="callout-info">Hello</p>', 'Greeting')).toEqual(
      expect.stringContaining('class="callout-info" style="background-color:#eff6ff'),
    );
    expect(wrapWorkflowEmail('<html><body>Complete</body></html>', 'Greeting'))
      .toBe('<html><body>Complete</body></html>');
  });

  it('normalizes and validates retained E.164 inputs', () => {
    expect(normalizeWorkflowPhone('(602) 555-0101')).toBe('+16025550101');
    expect(normalizeWorkflowPhone('16025550101')).toBe('+16025550101');
    expect(validWorkflowPhone('+16025550101')).toBe(true);
    expect(validWorkflowPhone('+0123')).toBe(false);
  });

  it('persists positive waits and rejects invalid duration components', () => {
    expect(workflowWaitUntil({ delay_minutes: 5 }, 1_000)?.getTime()).toBe(301_000);
    expect(workflowWaitUntil({ delay_minutes: 0 }, 1_000)).toBeNull();
    expect(() => workflowWaitUntil({ delay_hours: -1 })).toThrow('non-negative finite');
    expect(() => workflowWaitUntil({ delay_days: 'invalid' })).toThrow('non-negative finite');
  });

  it('preserves every retained condition operator and fails unknown operators', () => {
    const contact = { status: 'active', tags: ['vip'], custom_fields: { score: 10 } };
    expect(workflowConditionResult(contact, { field: 'status', operator: 'equals', value: 'active' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'status', operator: 'not_equals', value: 'inactive' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'tags', operator: 'contains', value: 'vip' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'tags', operator: 'not_contains', value: 'cold' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'missing', operator: 'is_empty' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'status', operator: 'is_not_empty' })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'score', operator: 'greater_than', value: 9 })).toBe(true);
    expect(workflowConditionResult(contact, { field: 'score', operator: 'less_than', value: 11 })).toBe(true);
    expect(() => workflowConditionResult(contact, { field: 'status', operator: 'invented' }))
      .toThrow('Unsupported condition operator');
  });

  it('requires safe webhook URLs and strips transport-owned headers', () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(workflowWebhookUrl('https://example.com/hook')).toBe('https://example.com/hook');
      expect(() => workflowWebhookUrl('http://127.0.0.1/internal')).toThrow();
      expect(() => workflowWebhookUrl('https://[::ffff:127.0.0.1]/internal')).toThrow();
      expect(() => workflowWebhookUrl('https://user:pass@example.com/hook')).toThrow();
      expect(workflowWebhookHeaders({ Authorization: 'Bearer tenant', 'Content-Type': 'text/plain',
        'Idempotency-Key': 'spoofed', 'X-Itemize-Delivery': 'spoofed' }))
        .toEqual({ Authorization: 'Bearer tenant' });
    } finally {
      process.env.NODE_ENV = prior;
    }
  });
});
