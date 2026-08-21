import { describe, expect, it } from 'vitest';
import { shouldShowFeatureOnboarding } from '@/lib/onboardingVersion';

describe('shouldShowFeatureOnboarding', () => {
  it('shows onboarding that has never been seen', () => {
    expect(shouldShowFeatureOnboarding(undefined, '2.0')).toBe(true);
    expect(shouldShowFeatureOnboarding({ seen: false }, '2.0')).toBe(true);
  });

  it('does not show a dismissed tour again', () => {
    expect(
      shouldShowFeatureOnboarding(
        { seen: false, dismissed: true, version: '1.0' },
        '2.0',
      ),
    ).toBe(false);
  });

  it('shows a materially updated version once', () => {
    expect(
      shouldShowFeatureOnboarding({ seen: true, version: '1.0' }, '2.0'),
    ).toBe(true);
    expect(
      shouldShowFeatureOnboarding({ seen: true, version: '2.0' }, '2.0'),
    ).toBe(false);
  });

  it('treats legacy progress without a version as version 1.0', () => {
    expect(shouldShowFeatureOnboarding({ seen: true }, '1.0')).toBe(false);
    expect(shouldShowFeatureOnboarding({ seen: true }, '2.0')).toBe(true);
  });
});
