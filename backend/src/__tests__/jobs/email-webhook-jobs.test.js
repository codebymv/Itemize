const {
  emailReconciliationBackoffMs,
  redactEmailReconciliationError,
} = require('../../jobs/email-webhook-jobs');

describe('email webhook reconciliation jobs', () => {
  test('uses bounded exponential retry delays', () => {
    expect(emailReconciliationBackoffMs(1, 1000, 5000)).toBe(1000);
    expect(emailReconciliationBackoffMs(3, 1000, 5000)).toBe(4000);
    expect(emailReconciliationBackoffMs(9, 1000, 5000)).toBe(5000);
  });

  test('redacts recipient and provider credentials from persisted errors', () => {
    const error = new Error('Failed user@example.com with re_secret123 and whsec_test456');
    expect(redactEmailReconciliationError(error)).toBe(
      'Failed [redacted-email] with [redacted-secret] and [redacted-secret]'
    );
  });
});
