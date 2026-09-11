import { describe, expect, it } from 'vitest';
import { formatCalendarDate } from './calendar-date';

describe('invoice calendar dates', () => {
  it('preserves date-only and serialized date fields even when a western timezone is requested', () => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' };
    expect(formatCalendarDate('2026-10-11', options, 'en-US')).toBe('October 11, 2026');
    expect(formatCalendarDate('2026-10-11T00:00:00.000Z', options, 'en-US')).toBe('October 11, 2026');
    expect(formatCalendarDate('', options, 'en-US')).toBe('');
  });
});
