import { describe, expect, it } from 'vitest';
import { getPaymentStatusVisual } from './paymentConstants';

describe('getPaymentStatusVisual', () => {
  it.each([
    ['pending', 'orange'],
    ['processing', 'orange'],
    ['succeeded', 'green'],
    ['failed', 'red'],
    ['refunded', 'gray'],
    ['cancelled', 'red'],
  ] as const)('uses the canonical theme for %s payments', (status, theme) => {
    const visual = getPaymentStatusVisual(status);

    expect(visual.theme).toBe(theme);
    expect(visual.iconBackgroundClass).toContain(`bg-${theme}-100`);
    expect(visual.badgeClass).toContain(`bg-${theme}-100`);
  });

  it('provides a neutral fallback with a readable label', () => {
    const visual = getPaymentStatusVisual('awaiting_review');

    expect(visual.theme).toBe('gray');
    expect(visual.label).toBe('Awaiting Review');
  });
});
