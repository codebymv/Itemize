/**
 * Hook for managing period/date range selector state
 */

import { useState, useCallback } from 'react';

export type PeriodOption = '7days' | '30days' | '90days';

export const periodLabels: Record<PeriodOption, string> = {
  '7days': 'Last 7 days',
  '30days': 'Last 30 days',
  '90days': 'Last 90 days',
};

interface UsePeriodSelectorReturn {
  period: PeriodOption;
  setPeriod: (period: PeriodOption) => void;
  periodLabel: string;
}

export function usePeriodSelector(
  initialPeriod: PeriodOption = '30days'
): UsePeriodSelectorReturn {
  const [period, setPeriodState] = useState<PeriodOption>(initialPeriod);

  const setPeriod = useCallback((newPeriod: PeriodOption) => {
    setPeriodState(newPeriod);
  }, []);

  return {
    period,
    setPeriod,
    periodLabel: periodLabels[period],
  };
}
