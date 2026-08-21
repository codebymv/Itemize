import { describe, expect, it } from 'vitest';

import { formatDateOnly } from './invoiceFormatters';

describe('formatDateOnly', () => {
  it('preserves a calendar date from a date-only value', () => {
    expect(formatDateOnly('2026-09-20')).toBe('9/20/2026');
  });

  it('does not shift an ISO midnight value into the previous day', () => {
    expect(formatDateOnly('2026-09-20T00:00:00.000Z')).toBe('9/20/2026');
  });

  it('returns an unrecognized value unchanged', () => {
    expect(formatDateOnly('Not scheduled')).toBe('Not scheduled');
  });
});
