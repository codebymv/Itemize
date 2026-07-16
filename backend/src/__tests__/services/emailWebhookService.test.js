const {
  normalizeEmailWebhook,
  normalizedEmailWebhookFromClaim,
  shouldSuppressContact,
} = require('../../services/emailWebhookService');
const { verifyResendWebhook } = require('../../routes/email-webhooks.routes');

describe('email provider webhook policy', () => {
  test('normalizes provider identity, timestamp, and bounded bounce details', () => {
    const normalized = normalizeEmailWebhook('msg_delivery_1', {
      type: 'email.bounced',
      created_at: '2026-07-15T12:00:00.000Z',
      data: {
        email_id: 'provider-email-1',
        bounce: { type: 'Permanent', subType: 'General', message: 'x'.repeat(3000) },
      },
    });

    expect(normalized.externalId).toBe('provider-email-1');
    expect(normalized.config.emailLogStatus).toBe('bounced');
    expect(normalized.details.message).toHaveLength(2000);
  });

  test('rejects events without a stable provider id or occurrence time', () => {
    expect(() => normalizeEmailWebhook('delivery', {
      type: 'email.delivered', data: {}, created_at: '2026-07-15T12:00:00.000Z',
    })).toThrow('Invalid email provider id');
    expect(() => normalizeEmailWebhook('delivery', {
      type: 'email.delivered', data: { email_id: 'email-1' }, created_at: 'not-a-date',
    })).toThrow('Invalid webhook event timestamp');
  });

  test('suppresses complaints, provider suppression, and permanent bounces only', () => {
    expect(shouldSuppressContact('email.complained', {})).toBe(true);
    expect(shouldSuppressContact('email.suppressed', {})).toBe(true);
    expect(shouldSuppressContact('email.bounced', { bounceType: 'Permanent' })).toBe(true);
    expect(shouldSuppressContact('email.bounced', { bounceType: 'Transient' })).toBe(false);
  });

  test('fails closed before parsing when the signing secret is unavailable', () => {
    expect(() => verifyResendWebhook({
      rawBody: Buffer.from('{}'),
      headers: {},
      secret: '',
    })).toThrow('Resend webhook secret is not configured');
  });

  test('reconstructs a pending event entirely from its bounded claim fields', () => {
    const normalized = normalizedEmailWebhookFromClaim({
      svix_id: 'svix_replay_1',
      event_type: 'email.bounced',
      external_id: 'email_replay_1',
      event_created_at: new Date('2026-07-15T12:00:00.000Z'),
      details: { bounceType: 'Permanent', message: 'Mailbox unavailable' },
    });
    expect(normalized).toMatchObject({
      deliveryId: 'svix_replay_1',
      externalId: 'email_replay_1',
      eventType: 'email.bounced',
      details: { bounceType: 'Permanent' },
    });
  });
});
