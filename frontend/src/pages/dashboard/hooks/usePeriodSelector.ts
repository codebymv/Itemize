/**
 * Hook for managing period/date range selector state
 */

import { useState, useCallback } from 'react';

export type PeriodOption = '7days' | '30days' | '90days' | '6months' | '12months';

export const periodLabels: Record<PeriodOption, string> = {
  '7days': 'Last 7 days',
  '30days': 'Last 30 days',
  '90days': 'Last 90 days',
  '6months': 'Last 6 months',
  '12months': 'Last 12 months',
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
