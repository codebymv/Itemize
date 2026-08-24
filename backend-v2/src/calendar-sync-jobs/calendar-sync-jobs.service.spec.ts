import {
  calendarSyncBackoffMs,
  normalizeExternalEvent,
  redactCalendarSyncError,
} from './calendar-sync-jobs.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyJobs = require('../../../backend/src/jobs/calendar-sync-jobs');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('calendar sync job primitives (cross-runtime parity)', () => {
  it('computes the identical backoff curve as the legacy worker', () => {
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      expect(calendarSyncBackoffMs(attempt, 60_000, 3_600_000)).toBe(
        legacyJobs.calendarSyncBackoffMs(attempt, 60_000, 3_600_000),
      );
    }
  });

  it('redacts provider errors byte-for-byte like the legacy worker', () => {
    const samples = [
      new Error('Bearer ya29.a0AfB_secret leaked'),
      new Error('refresh_token: "1//abc-def" rejected'),
      new Error('Basic dXNlcjpwYXNz denied'),
      'plain string failure',
      null,
      new Error('x'.repeat(700)),
    ];
    for (const sample of samples) {
      expect(redactCalendarSyncError(sample)).toBe(
        legacyJobs.redactCalendarSyncError(sample),
      );
    }
  });

  it('normalizes external events identically to the legacy worker', () => {
    const cases = [
      { id: 'evt1', start: '2026-09-01T10:00:00Z', end: '2026-09-01T11:00:00Z' },
      {
        id: 'evt2',
        status: 'cancelled',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T11:00:00Z',
      },
      {
        id: 'evt3',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T11:00:00Z',
        extendedProperties: { private: { itemize_booking_id: '9' } },
      },
      { id: 'evt4', start: 'garbage', end: '2026-09-01T11:00:00Z' },
      { id: 'evt5', start: '2026-09-01T11:00:00Z', end: '2026-09-01T10:00:00Z' },
      { id: `evt6-${'x'.repeat(300)}`, start: '2026-09-01T10:00:00Z', end: '2026-09-01T11:00:00Z' },
      null,
      { start: '2026-09-01T10:00:00Z', end: '2026-09-01T11:00:00Z' },
    ];
    for (const sample of cases) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nest = normalizeExternalEvent(sample as any);
      const legacy = legacyJobs.normalizeExternalEvent(sample);
      if (legacy === null) {
        expect(nest).toBeNull();
      } else {
        expect(nest).toEqual({
          id: legacy.id,
          start: legacy.start,
          end: legacy.end,
        });
      }
    }
  });
});
