import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REVENUE_FLOW_PREFERENCES,
  revenueFlowPreferenceStorageKey,
  sanitizeRevenueFlowPreferences,
} from './useRevenueFlowPreferences';

describe('revenue flow preferences', () => {
  it('scopes preferences to both organization and user', () => {
    expect(revenueFlowPreferenceStorageKey(4, 'user-a')).not.toBe(revenueFlowPreferenceStorageKey(4, 'user-b'));
    expect(revenueFlowPreferenceStorageKey(4, 'user-a')).not.toBe(revenueFlowPreferenceStorageKey(5, 'user-a'));
  });

  it('validates series and preserves separate sizes for each context', () => {
    expect(sanitizeRevenueFlowPreferences({
      visibleSeries: ['netReceived', 'netReceived', 'unknown'],
      sizes: { dashboard: 'expanded', payments: 'compact' },
    })).toEqual({
      visibleSeries: ['netReceived'],
      sizes: { dashboard: 'expanded', payments: 'compact' },
    });
  });

  it('restores useful defaults when persisted data is empty or invalid', () => {
    expect(sanitizeRevenueFlowPreferences(null)).toEqual(DEFAULT_REVENUE_FLOW_PREFERENCES);
    expect(sanitizeRevenueFlowPreferences({
      visibleSeries: [],
      sizes: { dashboard: 'giant', payments: null },
    })).toEqual(DEFAULT_REVENUE_FLOW_PREFERENCES);
  });
});
