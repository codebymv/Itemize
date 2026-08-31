import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PipelineDealAge } from '@/services/analyticsApi';
import { PipelineDealAgeCard } from './PipelineDealAgeCard';

const dealAge: PipelineDealAge = {
  pipeline: { id: 1, name: 'Default pipeline' },
  stages: [
    {
      stageId: 'lead',
      stageName: 'Lead',
      stageColor: '#64748b',
      stageOrder: 1,
      openDealCount: 0,
      averageOpenDealAgeDays: 0,
      openValueByCurrency: [],
    },
    {
      stageId: 'qualified',
      stageName: 'Qualified',
      stageColor: '#3b82f6',
      stageOrder: 2,
      openDealCount: 1,
      averageOpenDealAgeDays: 2,
      openValueByCurrency: [{ currency: 'USD', amount: 18_000 }],
    },
  ],
  summary: {
    averageDaysToWin: 0,
    averageDaysToLose: 0,
    openDeals: 1,
    wonDeals: 0,
    lostDeals: 0,
    winRate: 0,
  },
};

describe('PipelineDealAgeCard', () => {
  it('omits the open-value placeholder for stages with no open deals', () => {
    render(<PipelineDealAgeCard dealAge={dealAge} />);

    const leadRow = screen.getByText('Lead').closest('.flex.items-center.gap-3');
    const qualifiedRow = screen.getByText('Qualified').closest('.flex.items-center.gap-3');

    expect(leadRow).not.toBeNull();
    expect(qualifiedRow).not.toBeNull();
    expect(within(leadRow as HTMLElement).queryByText('No open value')).not.toBeInTheDocument();
    expect(within(qualifiedRow as HTMLElement).getByText('USD 18,000')).toBeInTheDocument();
  });
});
