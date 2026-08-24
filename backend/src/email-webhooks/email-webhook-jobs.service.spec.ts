/**
 * Email webhook job primitives. The pinned values below were captured
 * from the legacy worker (backend/src/jobs/email-webhook-jobs.js)
 * before its retirement; matching them keeps retry cadence and log
 * redaction stable for rows the legacy runtime wrote.
 */
import {
  boundedInteger,
  emailReconciliationBackoffMs,
  redactEmailReconciliationError,
} from './email-webhook-jobs.service';

describe('email webhook job primitives', () => {
  it('computes the legacy exponential backoff curve', () => {
    const expected = [
      300000, 300000, 600000, 1200000, 2400000, 4800000,
    ];
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      expect(emailReconciliationBackoffMs(attempt, 300_000, 86_400_000)).toBe(
        expected[attempt],
      );
    }
    expect(emailReconciliationBackoffMs(9, 300_000, 86_400_000)).toBe(76800000);
    expect(emailReconciliationBackoffMs(12, 300_000, 86_400_000)).toBe(86400000);
  });

  it('redacts emails and provider secrets like the legacy worker', () => {
    expect(
      redactEmailReconciliationError(
        new Error('SMTP rejected recipient bounce-test@example.com permanently'),
      ),
    ).toBe('SMTP rejected recipient [redacted-email] permanently');
    expect(
      redactEmailReconciliationError(
        new Error('Upstream refused key re_a1B2c3D4e5 and whsec_deadbeefCAFE'),
      ),
    ).toBe('Upstream refused key [redacted-secret] and [redacted-secret]');
    expect(redactEmailReconciliationError(null)).toBe(
      'Email event reconciliation failed',
    );
    expect(redactEmailReconciliationError(new Error('x'.repeat(700)))).toHaveLength(500);
  });

  it('bounds worker options with fallbacks outside the range', () => {
    expect(boundedInteger('25', 10, 1, 100)).toBe(25);
    expect(boundedInteger(25, 10, 1, 100)).toBe(25);
    expect(boundedInteger(0, 10, 1, 100)).toBe(10);
    expect(boundedInteger(101, 10, 1, 100)).toBe(10);
    expect(boundedInteger(3.5, 10, 1, 100)).toBe(10);
    expect(boundedInteger(undefined, 10, 1, 100)).toBe(10);
    expect(boundedInteger('not-a-number', 10, 1, 100)).toBe(10);
  });
});
