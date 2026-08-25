import { describe, expect, it } from 'vitest';
import { ONBOARDING_CONTENT } from './onboardingContent';

const searchableCopy = (featureKey: string) => {
  const content = ONBOARDING_CONTENT[featureKey];
  return [
    content.title,
    content.description,
    ...content.steps.flatMap((step) => [
      step.title,
      step.description,
      ...(step.tips ?? []),
    ]),
  ].join(' ').toLowerCase();
};

describe('grouped onboarding content', () => {
  it('introduces Canvas as a flexible workspace instead of a list creator', () => {
    expect(ONBOARDING_CONTENT.canvas).toMatchObject({
      version: '3.0',
      completeLabel: 'Choose a format',
    });
    expect(ONBOARDING_CONTENT.canvas.steps).toHaveLength(2);

    const copy = searchableCopy('canvas');
    for (const capability of ['lists', 'notes', 'whiteboards', 'wireframes', 'vaults']) {
      expect(copy).toContain(capability);
    }
  });

  it.each([
    ['invoices', ['estimates', 'invoices', 'recurring invoices', 'products']],
    ['calendars', ['calendars', 'bookings', 'integrations']],
    ['inbox', ['inbox', 'chat widget', 'social']],
    ['campaigns', ['segments', 'campaigns', 'email templates', 'sms templates']],
    ['pages', ['pages', 'forms']],
    ['reputation', ['reviews', 'review requests', 'widgets']],
  ])('represents the full %s navigation group', (featureKey, capabilities) => {
    expect(ONBOARDING_CONTENT[featureKey].version).toBe('2.0');
    const copy = searchableCopy(featureKey);
    for (const capability of capabilities) {
      expect(copy).toContain(capability);
    }
  });

  it('uses completion labels that describe navigation, not content creation', () => {
    for (const featureKey of [
      'canvas',
      'invoices',
      'calendars',
      'inbox',
      'campaigns',
      'pages',
      'reputation',
    ]) {
      expect(ONBOARDING_CONTENT[featureKey].completeLabel).not.toMatch(/^create\b/i);
    }
  });
});
