/** Shared public/organizer booking input contract. Null is handled by callers. */
export function bookingTimezone(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 100) {
    throw new RangeError('timezone must contain between 1 and 100 characters');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch {
    throw new RangeError('timezone must be a valid IANA timezone');
  }
  return normalized;
}
