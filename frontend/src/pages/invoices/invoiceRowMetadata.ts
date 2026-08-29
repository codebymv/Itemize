const DAY_MS = 24 * 60 * 60 * 1000;

export const getWholeDaysSince = (
  value: string,
  now: number = Date.now(),
): number | null => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
};

export const getPaidAgeLabel = (
  paidAt?: string,
  now: number = Date.now(),
): string | null => {
  if (!paidAt) return null;

  const days = getWholeDaysSince(paidAt, now);
  return days === null ? null : `Paid ${days}d ago`;
};
