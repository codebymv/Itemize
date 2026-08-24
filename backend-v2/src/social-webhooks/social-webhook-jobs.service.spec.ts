import {
  redactSocialWebhookError,
  socialWebhookBackoffMs,
} from './social-webhook-jobs.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyJobs = require('../../../backend/src/jobs/social-webhook-jobs');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('social webhook job primitives (cross-runtime parity)', () => {
  it('computes the identical backoff curve as the legacy worker', () => {
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      expect(socialWebhookBackoffMs(attempt, 300_000, 86_400_000)).toBe(
        legacyJobs.socialWebhookBackoffMs(attempt, 300_000, 86_400_000),
      );
      expect(socialWebhookBackoffMs(attempt, 1_000, 8_000)).toBe(
        legacyJobs.socialWebhookBackoffMs(attempt, 1_000, 8_000),
      );
    }
  });

  it('redacts Meta tokens and signatures byte-for-byte like the legacy worker', () => {
    const samples = [
      new Error('Graph API rejected token EAABsbCS1234abcDEF_ghi'),
      new Error('signature sha256=' + 'a'.repeat(64) + ' did not verify'),
      new Error('IGQVJfixture-token_rejected for page'),
      'plain string failure',
      null,
      new Error('x'.repeat(700)),
    ];
    for (const sample of samples) {
      expect(redactSocialWebhookError(sample)).toBe(
        legacyJobs.redactSocialWebhookError(sample),
      );
    }
  });
});
