import { describe, expect, it } from 'vitest';
import { CAMPAIGN_SUMMARY_VISUALS, getCampaignStatusVisual, getCatalogStatusVisual } from './campaignVisuals';

describe('campaign visual grammar', () => {
  it.each([
    ['draft', 'blue'],
    ['scheduled', 'orange'],
    ['sending', 'orange'],
    ['paused', 'orange'],
    ['sent', 'green'],
    ['failed', 'red'],
    ['cancelled', 'red'],
  ] as const)('maps %s to the %s outcome family', (status, theme) => {
    expect(getCampaignStatusVisual(status).theme).toBe(theme);
  });

  it('describes catalog eligibility as available or unavailable', () => {
    expect(getCatalogStatusVisual(true).theme).toBe('blue');
    expect(getCatalogStatusVisual(true).label).toBe('Available');
    expect(getCatalogStatusVisual(false).theme).toBe('orange');
    expect(getCatalogStatusVisual(false).label).toBe('Unavailable');
  });

  it('reuses canonical lifecycle visuals in the campaign summary', () => {
    expect(CAMPAIGN_SUMMARY_VISUALS.draft).toBe(getCampaignStatusVisual('draft'));
    expect(CAMPAIGN_SUMMARY_VISUALS.inProgress).toBe(getCampaignStatusVisual('sending'));
    expect(CAMPAIGN_SUMMARY_VISUALS.delivered).toBe(getCampaignStatusVisual('sent'));
  });
});
