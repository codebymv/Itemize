import {
  campaignUnsubscribeRecipientId,
  campaignUnsubscribeToken,
  campaignUnsubscribeTokenMatches,
  campaignUnsubscribeUrl,
} from './campaign-unsubscribe.token';

describe('campaign unsubscribe capability', () => {
  const claims = {
    recipientId: 12,
    organizationId: 4,
    campaignId: 9,
    email: 'Recipient@Example.com',
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'campaign-unsubscribe-test-secret-at-least-32-characters';
    process.env.PUBLIC_API_URL = 'https://api.itemize.test/base/path';
  });

  afterEach(() => {
    delete process.env.PUBLIC_API_URL;
  });

  it('creates a stable recipient-bound token and public URL', () => {
    const token = campaignUnsubscribeToken(claims);
    expect(token).toMatch(/^12\.[A-Za-z0-9_-]{43}$/);
    expect(campaignUnsubscribeRecipientId(token)).toBe(12);
    expect(campaignUnsubscribeTokenMatches(token, {
      ...claims,
      email: 'recipient@example.com',
    })).toBe(true);
    expect(campaignUnsubscribeUrl(token)).toBe(
      `https://api.itemize.test/api/campaigns/unsubscribe/${token}`,
    );
  });

  it('rejects malformed and cross-recipient capabilities', () => {
    const token = campaignUnsubscribeToken(claims);
    expect(campaignUnsubscribeRecipientId('not-a-token')).toBeNull();
    expect(campaignUnsubscribeTokenMatches(token, { ...claims, campaignId: 10 })).toBe(false);
    expect(campaignUnsubscribeTokenMatches(`13.${token.split('.')[1]}`, claims)).toBe(false);
  });

  it('requires HTTPS for production unsubscribe URLs', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_API_URL = 'http://api.itemize.test';
    expect(() => campaignUnsubscribeUrl(campaignUnsubscribeToken(claims)))
      .toThrow('Campaign unsubscribe URLs must use HTTPS in production');
    process.env.NODE_ENV = 'test';
  });
});
