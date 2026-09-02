import { reputationWidgetCreationFingerprint } from './reputation-widget-creation.idempotency';
import type { ReputationWidgetValues } from './reputation-configuration.repository';

const values: ReputationWidgetValues = {
  name: 'Homepage', widgetType: 'grid', theme: 'auto', primaryColor: '#2563EB',
  backgroundColor: '#FFFFFF', textColor: '#0F172A', borderRadius: 12,
  showRatingStars: true, showReviewerPhoto: true, showReviewDate: true,
  showPlatformIcon: true, minRating: 4, platforms: ['google', 'facebook'],
  maxReviews: 6, hideNoTextReviews: false, autoRefresh: true,
  refreshIntervalHours: 24, isActive: true,
};

describe('reputationWidgetCreationFingerprint', () => {
  it('is stable across object key order and set-like platform order', () => {
    const reordered = Object.fromEntries(Object.entries(values).reverse()) as ReputationWidgetValues;
    expect(reputationWidgetCreationFingerprint(values))
      .toBe(reputationWidgetCreationFingerprint(reordered));
    expect(reputationWidgetCreationFingerprint(values)).toBe(
      reputationWidgetCreationFingerprint({ ...values, platforms: [...values.platforms].reverse() }),
    );
  });

  it('changes when normalized widget content changes', () => {
    expect(reputationWidgetCreationFingerprint(values)).not.toBe(
      reputationWidgetCreationFingerprint({ ...values, name: 'Checkout' }),
    );
  });
});
