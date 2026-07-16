const {
  redactWorkflowTriggerError,
  workflowTriggerBackoffMs,
} = require('../../jobs/workflow-trigger-jobs');
const {
  workflowTriggerEventKey,
} = require('../../services/workflowTriggerQueue');

describe('workflow trigger queue contract', () => {
  test('builds source-scoped event keys and rejects unsupported sources', () => {
    expect(workflowTriggerEventKey('domain', 'contact_added:42'))
      .toBe('domain:contact_added:42');
    expect(() => workflowTriggerEventKey('invented', '42'))
      .toThrow(/Unsupported workflow trigger source/);
  });

  test('bounds exponential retry delay', () => {
    expect(workflowTriggerBackoffMs(1, 1000, 10_000)).toBe(1000);
    expect(workflowTriggerBackoffMs(3, 1000, 10_000)).toBe(4000);
    expect(workflowTriggerBackoffMs(9, 1000, 10_000)).toBe(10_000);
  });

  test('redacts contact and provider secrets from dead-letter errors', () => {
    expect(redactWorkflowTriggerError(
      new Error('user@example.test +16025550199 re_live_secret')
    )).toBe('[redacted-email] [redacted-phone] [redacted-secret]');
  });
});
