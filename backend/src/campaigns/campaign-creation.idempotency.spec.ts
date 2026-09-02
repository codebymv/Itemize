import { campaignCreationFingerprint } from './campaign-creation.idempotency';

describe('campaignCreationFingerprint', () => {
  it('canonicalizes nested targeting configuration', () => {
    expect(
      campaignCreationFingerprint('create', {
        name: 'Launch',
        segmentFilter: { operator: 'and', status: 'active' },
      }),
    ).toBe(
      campaignCreationFingerprint('create', {
        segmentFilter: { status: 'active', operator: 'and' },
        name: 'Launch',
      }),
    );
  });

  it('separates actions and duplicate sources', () => {
    expect(
      campaignCreationFingerprint('duplicate', { sourceCampaignId: 9 }),
    ).not.toBe(
      campaignCreationFingerprint('duplicate', { sourceCampaignId: 10 }),
    );
    expect(
      campaignCreationFingerprint('duplicate', { sourceCampaignId: 9 }),
    ).not.toBe(
      campaignCreationFingerprint('create', { sourceCampaignId: 9 }),
    );
  });
});
