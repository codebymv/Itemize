import { describe, expect, it } from 'vitest';

import {
  formatCompactMoney,
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatTightMoney,
  formatTightNumber,
} from './numberFormat';

describe('numberFormat', () => {
  it('provides full, compact, and tight number representations', () => {
    expect(formatNumber(11_543, { locale: 'en-US' })).toBe('11,543');
    expect(formatCompactNumber(11_543, { locale: 'en-US' })).toBe('11.5K');
    expect(formatTightNumber(11_543, { locale: 'en-US' })).toBe('12K');
  });

  it('keeps the currency identity in every money representation', () => {
    const options = { currency: 'USD', locale: 'en-US' } as const;

    expect(formatMoney(11_543, options)).toBe('$11,543.00');
    expect(formatCompactMoney(11_543, options)).toBe('$11.5K');
    expect(formatTightMoney(11_543, options)).toBe('$12K');
  });

  it('uses the selected locale rather than manually assembling values', () => {
    expect(formatCompactMoney(11_543, { currency: 'EUR', locale: 'de-DE' }))
      .toMatch(/11,5K.*€/);
  });

  it('falls back safely when a currency code cannot be formatted', () => {
    expect(formatMoney(11_543, { currency: 'not-a-currency', locale: 'en-US' }))
      .toBe('NOT-A-CURRENCY 11,543');
  });
});
