import {
  boundedInteger,
  emailReconciliationBackoffMs,
  redactEmailReconciliationError,
} from './email-webhook-jobs.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyJobs = require('../../../backend/src/jobs/email-webhook-jobs');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('email webhook job primitives (cross-runtime parity)', () => {
  it('computes the identical backoff curve as the legacy worker', () => {
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      expect(emailReconciliationBackoffMs(attempt, 300_000, 86_400_000)).toBe(
        legacyJobs.emailReconciliationBackoffMs(attempt, 300_000, 86_400_000),
      );
      expect(emailReconciliationBackoffMs(attempt, 1_000, 8_000)).toBe(
        legacyJobs.emailReconciliationBackoffMs(attempt, 1_000, 8_000),
      );
    }
  });

  it('redacts errors byte-for-byte like the legacy worker', () => {
    const samples = [
      new Error('SMTP rejected recipient bounce-test@example.com permanently'),
      new Error('Upstream refused key re_a1B2c3D4e5 and whsec_deadbeefCAFE'),
      new Error('sk_live_ABC123 leaked in trace'),
      'plain string failure',
      null,
      new Error('x'.repeat(700)),
    ];
    for (const sample of samples) {
      expect(redactEmailReconciliationError(sample)).toBe(
        legacyJobs.redactEmailReconciliationError(sample),
      );
    }
  });

  it('bounds worker options exactly like the legacy parser', () => {
    const grid: Array<[unknown, number, number, number]> = [
      ['25', 10, 1, 100],
      [25, 10, 1, 100],
      [0, 10, 1, 100],
      [101, 10, 1, 100],
      [3.5, 10, 1, 100],
      [undefined, 10, 1, 100],
      ['not-a-number', 10, 1, 100],
    ];
    for (const [value, fallback, min, max] of grid) {
      const expected =
        Number.isInteger(Number(value)) &&
        Number(value) >= min &&
        Number(value) <= max
          ? Number(value)
          : fallback;
      expect(boundedInteger(value, fallback, min, max)).toBe(expected);
    }
  });
});
