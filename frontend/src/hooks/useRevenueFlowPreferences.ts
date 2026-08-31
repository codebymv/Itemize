import { useCallback, useEffect, useMemo, useState } from 'react';

import { storage } from '@/lib/storage';

export const REVENUE_FLOW_SERIES = ['bookedSales', 'netReceived', 'refunds'] as const;
export const REVENUE_FLOW_SIZES = ['compact', 'standard', 'expanded'] as const;

export type RevenueFlowSeries = typeof REVENUE_FLOW_SERIES[number];
export type RevenueFlowSize = typeof REVENUE_FLOW_SIZES[number];
export type RevenueFlowContext = 'dashboard' | 'payments';

export interface RevenueFlowPreferences {
  visibleSeries: RevenueFlowSeries[];
  sizes: Record<RevenueFlowContext, RevenueFlowSize>;
}

const STORAGE_VERSION = 'v1';

export const DEFAULT_REVENUE_FLOW_PREFERENCES: RevenueFlowPreferences = {
  visibleSeries: [...REVENUE_FLOW_SERIES],
  sizes: {
    dashboard: 'compact',
    payments: 'standard',
  },
};

const isSeries = (value: unknown): value is RevenueFlowSeries => (
  typeof value === 'string' && REVENUE_FLOW_SERIES.includes(value as RevenueFlowSeries)
);

const isSize = (value: unknown): value is RevenueFlowSize => (
  typeof value === 'string' && REVENUE_FLOW_SIZES.includes(value as RevenueFlowSize)
);

export const revenueFlowPreferenceStorageKey = (
  organizationId: number | null | undefined,
  userId: string | null | undefined,
) => `itemize:revenue-flow:${organizationId ?? 'unknown-org'}:${userId ?? 'unknown-user'}:${STORAGE_VERSION}`;

export function sanitizeRevenueFlowPreferences(value: unknown): RevenueFlowPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      visibleSeries: [...DEFAULT_REVENUE_FLOW_PREFERENCES.visibleSeries],
      sizes: { ...DEFAULT_REVENUE_FLOW_PREFERENCES.sizes },
    };
  }

  const candidate = value as {
    visibleSeries?: unknown;
    sizes?: Partial<Record<RevenueFlowContext, unknown>>;
  };
  const visibleSeries = Array.isArray(candidate.visibleSeries)
    ? Array.from(new Set(candidate.visibleSeries.filter(isSeries)))
    : [...DEFAULT_REVENUE_FLOW_PREFERENCES.visibleSeries];

  return {
    visibleSeries: visibleSeries.length > 0
      ? visibleSeries
      : [...DEFAULT_REVENUE_FLOW_PREFERENCES.visibleSeries],
    sizes: {
      dashboard: isSize(candidate.sizes?.dashboard)
        ? candidate.sizes.dashboard
        : DEFAULT_REVENUE_FLOW_PREFERENCES.sizes.dashboard,
      payments: isSize(candidate.sizes?.payments)
        ? candidate.sizes.payments
        : DEFAULT_REVENUE_FLOW_PREFERENCES.sizes.payments,
    },
  };
}

const loadPreferences = (key: string): RevenueFlowPreferences => {
  const raw = storage.getItem(key);
  if (!raw) return sanitizeRevenueFlowPreferences(null);
  try {
    return sanitizeRevenueFlowPreferences(JSON.parse(raw));
  } catch {
    return sanitizeRevenueFlowPreferences(null);
  }
};

export function useRevenueFlowPreferences({
  organizationId,
  userId,
  context,
}: {
  organizationId?: number | null;
  userId?: string | null;
  context: RevenueFlowContext;
}) {
  const storageKey = useMemo(
    () => revenueFlowPreferenceStorageKey(organizationId, userId),
    [organizationId, userId],
  );
  const [preferences, setPreferences] = useState<RevenueFlowPreferences>(() => loadPreferences(storageKey));

  useEffect(() => {
    setPreferences(loadPreferences(storageKey));
  }, [storageKey]);

  const savePreferences = useCallback((next: RevenueFlowPreferences) => {
    const sanitized = sanitizeRevenueFlowPreferences(next);
    setPreferences(sanitized);
    storage.setItem(storageKey, JSON.stringify(sanitized));
  }, [storageKey]);

  const setVisibleSeries = useCallback((visibleSeries: RevenueFlowSeries[]) => {
    if (visibleSeries.length === 0) return;
    savePreferences({ ...preferences, visibleSeries });
  }, [preferences, savePreferences]);

  const setSize = useCallback((size: RevenueFlowSize) => {
    savePreferences({
      ...preferences,
      sizes: { ...preferences.sizes, [context]: size },
    });
  }, [context, preferences, savePreferences]);

  return {
    visibleSeries: preferences.visibleSeries,
    size: preferences.sizes[context],
    setVisibleSeries,
    setSize,
  };
}
