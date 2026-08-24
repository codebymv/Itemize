/**
 * Delay until the next wall-clock occurrence of `hour`:00 in `timeZone`,
 * replacing the legacy node-cron daily expressions ('0 6 * * *' etc.).
 * Computed from the zone's current wall-clock minutes-of-day, so it is
 * exact except across a DST transition inside the wait window, where it
 * can drift by the offset change — acceptable for idempotent daily
 * batch jobs.
 */
export function msUntilNextDailyHour(
  hour: number,
  timeZone: string,
  now: Date = new Date(),
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const currentSeconds =
    (read('hour') % 24) * 3600 + read('minute') * 60 + read('second');
  const targetSeconds = hour * 3600;
  let deltaSeconds = targetSeconds - currentSeconds;
  if (deltaSeconds <= 0) deltaSeconds += 24 * 3600;
  return deltaSeconds * 1000;
}

export const DAILY_JOB_TIMEZONE = (): string =>
  process.env.TZ || 'America/New_York';
