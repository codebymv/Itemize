import { describe, expect, it } from 'vitest';
import { getEstimateStatusVisual } from './estimateConstants';

describe('getEstimateStatusVisual', () => {
  it.each([
    ['draft', 'blue'],
    ['sent', 'orange'],
    ['accepted', 'green'],
    ['declined', 'red'],
    ['expired', 'red'],
  ] as const)('uses the canonical theme for %s estimates', (status, theme) => {
    const visual = getEstimateStatusVisual(status);

    expect(visual.theme).toBe(theme);
    expect(visual.iconBackgroundClass).toContain(`bg-${theme}-100`);
    expect(visual.badgeClass).toContain(`bg-${theme}-100`);
  });

  it('provides a neutral fallback with a readable label', () => {
    const visual = getEstimateStatusVisual('awaiting_approval');

    expect(visual.theme).toBe('gray');
    expect(visual.label).toBe('Awaiting Approval');
  });
});
