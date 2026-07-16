const crypto = require('crypto');
const {
  normalizeMetaMessagingEvent,
  verifyMetaChallenge,
  verifyMetaSignature,
} = require('../../services/socialWebhookService');

describe('Meta webhook policy', () => {
  test('verifies the exact raw body with X-Hub-Signature-256', () => {
    const rawBody = Buffer.from('{"object":"page"}');
    const secret = 'meta-test-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    expect(verifyMetaSignature({ rawBody, signature, secret })).toBe(true);
    expect(() => verifyMetaSignature({
      rawBody: Buffer.from('{"object":"instagram"}'), signature, secret,
    })).toThrow('Invalid Meta webhook signature');
  });

  test('fails closed when webhook secrets are unavailable', () => {
    expect(() => verifyMetaSignature({
      rawBody: Buffer.from('{}'), signature: 'sha256='.padEnd(71, '0'), secret: '',
    })).toThrow('Meta app secret is not configured');
    expect(() => verifyMetaChallenge({
      mode: 'subscribe', token: 'candidate', configuredToken: '',
    })).toThrow('Meta webhook verify token is not configured');
  });

  test('accepts only the configured subscribe challenge token', () => {
    expect(verifyMetaChallenge({
      mode: 'subscribe', token: 'expected', configuredToken: 'expected',
    })).toBe(true);
    expect(verifyMetaChallenge({
      mode: 'subscribe', token: 'wrong', configuredToken: 'expected',
    })).toBe(false);
    expect(verifyMetaChallenge({
      mode: 'unsubscribe', token: 'expected', configuredToken: 'expected',
    })).toBe(false);
  });

  test('normalizes bounded message evidence and rejects unstable identities', () => {
    const normalized = normalizeMetaMessagingEvent('page-1', {
      sender: { id: 'sender-1' },
      timestamp: 1784120000000,
      message: {
        mid: 'message-1',
        text: 'x'.repeat(12000),
        attachments: [{ type: 'image', payload: { url: 'http://unsafe.example/image.png' } }],
      },
    }, 'facebook');

    expect(normalized.eventKey).toBe('facebook:message-1');
    expect(normalized.textContent).toHaveLength(10000);
    expect(normalized.mediaUrl).toBeNull();
    expect(() => normalizeMetaMessagingEvent('page-1', {
      sender: { id: 'sender-1' }, timestamp: 1784120000000, message: {},
    }, 'facebook')).toThrow('Invalid social message id');
  });
});
