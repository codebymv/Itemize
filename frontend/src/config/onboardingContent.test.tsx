import { describe, expect, it } from 'vitest';
import { ONBOARDING_CONTENT } from './onboardingContent';

describe('first-run onboarding content', () => {
  it('gives Canvas one direct first-value action', () => {
    expect(ONBOARDING_CONTENT.canvas).toMatchObject({
      version: '2.0',
      completeLabel: 'Create first list',
    });
    expect(ONBOARDING_CONTENT.canvas.steps).toHaveLength(1);
    expect(ONBOARDING_CONTENT.canvas.steps[0].title).toBe('Create your first list');
  });
});
