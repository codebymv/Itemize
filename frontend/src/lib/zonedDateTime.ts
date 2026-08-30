function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function offsetAt(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const representedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock date and time in an IANA zone into an ISO instant. */
export function zonedDateTimeToIso(dateValue: string, timeValue: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!match || !timeMatch) throw new Error('Choose a valid date and time.');

  const [, year, month, day] = match;
  const [, hour, minute] = timeMatch;
  const wallClockUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = wallClockUtc - offsetAt(new Date(wallClockUtc), timeZone);
  instant = wallClockUtc - offsetAt(new Date(instant), timeZone);

  const result = new Date(instant);
  const resolved = zonedParts(result, timeZone);
  if (resolved.year !== year || resolved.month !== month || resolved.day !== day || resolved.hour !== hour || resolved.minute !== minute) {
    throw new Error('That local time does not exist in the selected timezone. Choose another time.');
  }
  return result.toISOString();
}

export function zonedDateTimeInput(value: Date, timeZone: string): { date: string; time: string } {
  const parts = zonedParts(value, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
