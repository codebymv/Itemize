import { describe, expect, it } from 'vitest';
import {
  clampRate,
  getCampaignPreviewHtml,
  isCampaignEditable,
  percentOf,
  recipientDisplayName,
  scheduleFieldsFor,
} from './campaignDetailModel';

describe('campaignDetailModel', () => {
  it('limits setup editing to draft and scheduled campaigns', () => {
    expect(isCampaignEditable('draft')).toBe(true);
    expect(isCampaignEditable('scheduled')).toBe(true);
    expect(isCampaignEditable('sending')).toBe(false);
    expect(isCampaignEditable('sent')).toBe(false);
  });

  it('keeps report percentages safe and bounded', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(4, 0)).toBe(0);
    expect(clampRate(180)).toBe(100);
    expect(clampRate(Number.NaN)).toBe(0);
  });

  it('prefers an actively selected template for the preview', () => {
    const campaign = { content_html: '<p>custom</p>', template_html: '<p>stored</p>' };
    expect(getCampaignPreviewHtml(campaign, '<p>selected</p>')).toBe('<p>selected</p>');
    expect(getCampaignPreviewHtml(campaign)).toBe('<p>custom</p>');
  });

  it('formats schedule fields in the campaign timezone', () => {
    expect(scheduleFieldsFor('2026-09-12T16:30:00.000Z', 'America/Phoenix')).toEqual({
      date: '2026-09-12',
      time: '09:30',
    });
  });

  it('uses contact names before falling back to email', () => {
    expect(recipientDisplayName({ email: 'a@example.test', contact_first_name: 'Avery', contact_last_name: 'Morgan' })).toBe('Avery Morgan');
    expect(recipientDisplayName({ email: 'a@example.test' })).toBe('a@example.test');
  });
});
