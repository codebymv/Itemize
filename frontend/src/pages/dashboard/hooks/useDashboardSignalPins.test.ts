import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DASHBOARD_SIGNAL_IDS,
  MAX_PINNED_DASHBOARD_SIGNALS,
} from '../signals/dashboardSignalCatalog';
import { dashboardSignalStorageKey, sanitizeDashboardSignalPins } from './useDashboardSignalPins';

describe('dashboard signal preferences', () => {
  it('scopes pin order to both organization and user', () => {
    expect(dashboardSignalStorageKey(4, 'user-a')).not.toBe(dashboardSignalStorageKey(4, 'user-b'));
    expect(dashboardSignalStorageKey(4, 'user-a')).not.toBe(dashboardSignalStorageKey(5, 'user-a'));
  });

  it('deduplicates, validates, and caps persisted signals', () => {
    const saved = [
      'contacts-total',
      'contacts-total',
      'not-a-signal',
      'deals-open',
      'bookings-upcoming',
      'tasks-overdue',
      'invoices-pending',
      'invoices-overdue',
      'signatures-awaiting',
      'workspace-active',
      'revenue-net',
    ];

    const result = sanitizeDashboardSignalPins(saved);

    expect(result).toHaveLength(MAX_PINNED_DASHBOARD_SIGNALS);
    expect(new Set(result).size).toBe(result.length);
    expect(result).not.toContain('not-a-signal');
  });

  it('restores useful defaults when persisted data is empty or invalid', () => {
    expect(sanitizeDashboardSignalPins([])).toEqual(DEFAULT_DASHBOARD_SIGNAL_IDS);
    expect(sanitizeDashboardSignalPins('contacts-total')).toEqual(DEFAULT_DASHBOARD_SIGNAL_IDS);
  });
});
