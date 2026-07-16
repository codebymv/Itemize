const {
  redactSocialWebhookError,
  socialWebhookBackoffMs,
} = require('../../jobs/social-webhook-jobs');

describe('social webhook jobs', () => {
  test('uses capped exponential retry delays', () => {
    expect(socialWebhookBackoffMs(1, 1000, 5000)).toBe(1000);
    expect(socialWebhookBackoffMs(3, 1000, 5000)).toBe(4000);
    expect(socialWebhookBackoffMs(5, 1000, 5000)).toBe(5000);
  });

  test('redacts provider credentials from persisted errors', () => {
    const signature = `sha256=${'a'.repeat(64)}`;
    expect(redactSocialWebhookError(new Error(`failed ${signature} EAAJsecretvalue`)))
      .toBe('failed [redacted-signature] [redacted-token]');
  });
});
