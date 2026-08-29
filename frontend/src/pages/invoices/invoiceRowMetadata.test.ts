import { describe, expect, it } from 'vitest';
import { getPaidAgeLabel, getWholeDaysSince } from './invoiceRowMetadata';

describe('invoice row age metadata', () => {
  const now = new Date('2026-08-28T20:00:00.000Z').getTime();

  it('renders paid age from the authoritative payment timestamp', () => {
    expect(getPaidAgeLabel('2026-08-25T19:59:59.000Z', now)).toBe('Paid 3d ago');
  });

  it('shows a same-day payment as zero days ago', () => {
    expect(getPaidAgeLabel('2026-08-28T12:00:00.000Z', now)).toBe('Paid 0d ago');
  });

  it('omits missing or invalid payment timestamps', () => {
    expect(getPaidAgeLabel(undefined, now)).toBeNull();
    expect(getPaidAgeLabel('not-a-date', now)).toBeNull();
    expect(getWholeDaysSince('not-a-date', now)).toBeNull();
  });
});
