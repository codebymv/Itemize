import { useCallback, useEffect, useMemo, useState } from 'react';

import { storage } from '@/lib/storage';
import {
  DEFAULT_DASHBOARD_SIGNAL_IDS,
  isDashboardSignalId,
  MAX_PINNED_DASHBOARD_SIGNALS,
  MIN_PINNED_DASHBOARD_SIGNALS,
  type DashboardSignalId,
} from '../signals/dashboardSignalCatalog';

const STORAGE_VERSION = 'v1';

export const dashboardSignalStorageKey = (
  organizationId: number | null | undefined,
  userId: string | null | undefined,
) => `itemize:dashboard:${organizationId ?? 'unknown-org'}:${userId ?? 'unknown-user'}:overview-signals:${STORAGE_VERSION}`;

export function sanitizeDashboardSignalPins(value: unknown): DashboardSignalId[] {
  if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_SIGNAL_IDS];
  const valid = Array.from(new Set(value.filter(isDashboardSignalId))).slice(0, MAX_PINNED_DASHBOARD_SIGNALS);
  return valid.length >= MIN_PINNED_DASHBOARD_SIGNALS
    ? valid
    : [...DEFAULT_DASHBOARD_SIGNAL_IDS];
}

const loadPins = (key: string): DashboardSignalId[] => {
  const raw = storage.getItem(key);
  if (!raw) return [...DEFAULT_DASHBOARD_SIGNAL_IDS];
  try {
    return sanitizeDashboardSignalPins(JSON.parse(raw));
  } catch {
    return [...DEFAULT_DASHBOARD_SIGNAL_IDS];
  }
};

export function useDashboardSignalPins({
  organizationId,
  userId,
}: {
  organizationId?: number | null;
  userId?: string | null;
}) {
  const storageKey = useMemo(
    () => dashboardSignalStorageKey(organizationId, userId),
    [organizationId, userId],
  );
  const [pinnedSignalIds, setPinnedSignalIds] = useState<DashboardSignalId[]>(() => loadPins(storageKey));

  useEffect(() => {
    setPinnedSignalIds(loadPins(storageKey));
  }, [storageKey]);

  const savePinnedSignalIds = useCallback((next: DashboardSignalId[]) => {
    const sanitized = sanitizeDashboardSignalPins(next);
    setPinnedSignalIds(sanitized);
    storage.setItem(storageKey, JSON.stringify(sanitized));
  }, [storageKey]);

  const resetPinnedSignalIds = useCallback(() => {
    savePinnedSignalIds([...DEFAULT_DASHBOARD_SIGNAL_IDS]);
  }, [savePinnedSignalIds]);

  return {
    pinnedSignalIds,
    savePinnedSignalIds,
    resetPinnedSignalIds,
  };
}
