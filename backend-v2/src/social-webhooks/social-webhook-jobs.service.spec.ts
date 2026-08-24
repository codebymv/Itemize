/**
 * Social webhook job primitives. The pinned values below were captured
 * from the legacy worker (backend/src/jobs/social-webhook-jobs.js)
 * before its retirement.
 */
import {
  redactSocialWebhookError,
  socialWebhookBackoffMs,
} from './social-webhook-jobs.service';

describe('social webhook job primitives', () => {
  it('computes the legacy exponential backoff curve', () => {
    expect(socialWebhookBackoffMs(0, 300_000, 86_400_000)).toBe(300000);
    expect(socialWebhookBackoffMs(1, 300_000, 86_400_000)).toBe(300000);
    expect(socialWebhookBackoffMs(3, 300_000, 86_400_000)).toBe(1200000);
    expect(socialWebhookBackoffMs(6, 300_000, 86_400_000)).toBe(9600000);
    expect(socialWebhookBackoffMs(12, 300_000, 86_400_000)).toBe(86400000);
  });

  it('redacts Meta tokens and signatures like the legacy worker', () => {
    expect(
      redactSocialWebhookError(
        new Error('Graph API rejected token EAABsbCS1234abcDEF_ghi'),
      ),
    ).toBe('Graph API rejected token [redacted-token]');
    expect(
      redactSocialWebhookError(
        new Error('signature sha256=' + 'a'.repeat(64) + ' did not verify'),
      ),
    ).toBe('signature [redacted-signature] did not verify');
    expect(redactSocialWebhookError(null)).toBe(
      'Social webhook processing failed',
    );
    expect(redactSocialWebhookError(new Error('x'.repeat(700)))).toHaveLength(500);
  });
});
