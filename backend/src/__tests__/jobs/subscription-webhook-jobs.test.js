const emailService = require('../../services/emailService');
const {
  notificationBackoffMs,
  redactNotificationError,
  sendUpgradeNotification,
} = require('../../jobs/subscription-webhook-jobs');

describe('subscription webhook notification jobs', () => {
  test('uses bounded exponential retry delays', () => {
    expect(notificationBackoffMs(1, 1000, 5000)).toBe(1000);
    expect(notificationBackoffMs(3, 1000, 5000)).toBe(4000);
    expect(notificationBackoffMs(9, 1000, 5000)).toBe(5000);
  });

  test('redacts recipient and provider credentials from persisted errors', () => {
    const error = new Error('Failed user@example.com with re_secret123 and whsec_test456');
    expect(redactNotificationError(error)).toBe(
      'Failed [redacted-email] with [redacted-secret] and [redacted-secret]'
    );
  });

  test('uses the Stripe event as the provider idempotency key', async () => {
    const emailService = { sendEmail: jest.fn().mockResolvedValue({ success: true, id: 'email_1' }) };
    await expect(sendUpgradeNotification({
      stripe_event_id: 'evt_upgrade_1',
      owner_email: 'owner@example.com',
      organization_name: '<Example>',
      previous_plan: 'starter',
      new_plan: 'unlimited',
    }, emailService)).resolves.toMatchObject({ success: true, id: 'email_1' });
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'subscription-upgrade-evt_upgrade_1',
      to: 'owner@example.com',
    }));
    expect(emailService.sendEmail.mock.calls[0][0].html).toContain('&lt;Example&gt;');
  });

  test('passes idempotency keys through to the Resend request options', async () => {
    const original = {
      isConfigured: emailService.isConfigured,
      resend: emailService.resend,
      withRetry: emailService.withRetry,
    };
    try {
      emailService.isConfigured = true;
      emailService.withRetry = operation => operation();
      emailService.resend = {
        emails: { send: jest.fn().mockResolvedValue({ data: { id: 'email_2' } }) },
      };
      await expect(emailService.sendEmail({
        to: 'owner@example.com',
        subject: 'Upgrade',
        html: '<p>Upgrade</p>',
        idempotencyKey: 'subscription-upgrade-evt_2',
      })).resolves.toMatchObject({ success: true, id: 'email_2' });
      expect(emailService.resend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Upgrade' }),
        { idempotencyKey: 'subscription-upgrade-evt_2' }
      );
    } finally {
      emailService.isConfigured = original.isConfigured;
      emailService.resend = original.resend;
      emailService.withRetry = original.withRetry;
    }
  });
});
