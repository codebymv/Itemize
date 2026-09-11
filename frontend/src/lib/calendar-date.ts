/** Invoice dates are calendar days, not UTC instants. Preserve their day in every timezone. */
export function formatCalendarDate(value: string, options?: Intl.DateTimeFormatOptions, locale?: string): string {
  if (!value) return '';
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : new Date(value);
  return date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
}
