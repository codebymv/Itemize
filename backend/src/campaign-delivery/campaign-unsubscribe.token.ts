import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN = /^([1-9]\d{0,9})\.([A-Za-z0-9_-]{43})$/;

export type CampaignUnsubscribeClaims = {
  recipientId: number;
  organizationId: number;
  campaignId: number;
  email: string;
};

const secret = (): Buffer => {
  const dedicated = process.env.CAMPAIGN_UNSUBSCRIBE_SECRET?.trim();
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('CAMPAIGN_UNSUBSCRIBE_SECRET must be at least 32 characters');
    }
    return Buffer.from(dedicated);
  }
  const legacy = process.env.JWT_SECRET?.trim();
  if (!legacy) {
    throw new Error('Campaign unsubscribe tokens require CAMPAIGN_UNSUBSCRIBE_SECRET or JWT_SECRET');
  }
  return createHash('sha256')
    .update(`itemize-campaign-unsubscribe-key-v1:${legacy}`)
    .digest();
};

const signature = (claims: CampaignUnsubscribeClaims): string =>
  createHmac('sha256', secret())
    .update([
      'itemize-campaign-unsubscribe-v1',
      claims.recipientId,
      claims.organizationId,
      claims.campaignId,
      claims.email.trim().toLowerCase(),
    ].join(':'))
    .digest('base64url');

export const campaignUnsubscribeToken = (
  claims: CampaignUnsubscribeClaims,
): string => `${claims.recipientId}.${signature(claims)}`;

export const campaignUnsubscribeRecipientId = (token: string): number | null => {
  const matched = TOKEN.exec(token);
  if (!matched) return null;
  const id = Number(matched[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const campaignUnsubscribeTokenMatches = (
  token: string,
  claims: CampaignUnsubscribeClaims,
): boolean => {
  const matched = TOKEN.exec(token);
  if (!matched || Number(matched[1]) !== claims.recipientId) return false;
  const expected = Buffer.from(signature(claims));
  const actual = Buffer.from(matched[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const campaignUnsubscribeUrl = (token: string): string => {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://api.itemize.cloud'
    : `http://localhost:${process.env.PORT || '3100'}`;
  const configured = process.env.PUBLIC_API_URL
    || process.env.BACKEND_URL
    || process.env.API_URL
    || fallback;
  const url = new URL(configured);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Campaign unsubscribe URLs must use HTTPS in production');
  }
  return new URL(`/api/campaigns/unsubscribe/${token}`, url.origin).toString();
};
