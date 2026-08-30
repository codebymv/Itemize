import { describe, expect, it } from 'vitest';
import {
  getReputationPlatformLabel,
  getReviewPlatformConnectionVisual,
  getReviewRequestStatusVisual,
  getReviewSentimentVisual,
  getReviewWidgetAvailabilityVisual,
} from './reputationVisuals';

describe('reputation visuals', () => {
  it('uses the shared lifecycle palette for request outcomes', () => {
    expect(getReviewRequestStatusVisual('pending')).toMatchObject({ label: 'Pending', theme: 'orange' });
    expect(getReviewRequestStatusVisual('clicked')).toMatchObject({ label: 'Clicked', theme: 'blue' });
    expect(getReviewRequestStatusVisual('completed')).toMatchObject({ label: 'Completed', theme: 'green' });
    expect(getReviewRequestStatusVisual('failed')).toMatchObject({ label: 'Failed', theme: 'red' });
  });

  it('keeps sentiment semantic and catalog availability non-successful', () => {
    expect(getReviewSentimentVisual('positive')).toMatchObject({ theme: 'green' });
    expect(getReviewSentimentVisual('neutral')).toMatchObject({ theme: 'gray' });
    expect(getReviewWidgetAvailabilityVisual(true)).toMatchObject({ label: 'Available', theme: 'blue' });
    expect(getReviewWidgetAvailabilityVisual(false)).toMatchObject({ label: 'Unavailable', theme: 'orange' });
    expect(getReviewPlatformConnectionVisual(true)).toMatchObject({ label: 'Connected', theme: 'blue' });
  });

  it('normalizes platform names without losing unknown providers', () => {
    expect(getReputationPlatformLabel('facebook')).toBe('Facebook');
    expect(getReputationPlatformLabel('local_business')).toBe('Local Business');
  });
});
