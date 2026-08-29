import { describe, expect, it } from 'vitest';
import { getInvoiceStatusVisual } from './invoiceConstants';

describe('getInvoiceStatusVisual', () => {
  it.each([
    ['draft', 'blue'],
    ['sent', 'orange'],
    ['viewed', 'orange'],
    ['partial', 'orange'],
    ['overdue', 'red'],
    ['paid', 'green'],
    ['cancelled', 'red'],
    ['refunded', 'gray'],
  ] as const)('uses the canonical theme for %s invoices', (status, theme) => {
    const visual = getInvoiceStatusVisual(status);

    expect(visual.theme).toBe(theme);
    expect(visual.iconBackgroundClass).toContain(`bg-${theme}-100`);
    expect(visual.badgeClass).toContain(`bg-${theme}-100`);
  });

  it('provides a neutral fallback with a readable label', () => {
    const visual = getInvoiceStatusVisual('awaiting_review');

    expect(visual.theme).toBe('gray');
    expect(visual.label).toBe('Awaiting Review');
  });
});
