/**
 * Calendar sync job primitives. The pinned values below were captured
 * from the legacy worker (backend/src/jobs/calendar-sync-jobs.js)
 * before its retirement.
 */
import {
  calendarSyncBackoffMs,
  normalizeExternalEvent,
  redactCalendarSyncError,
} from './calendar-sync-jobs.service';

describe('calendar sync job primitives', () => {
  it('computes the legacy exponential backoff curve', () => {
    expect(calendarSyncBackoffMs(0, 60_000, 3_600_000)).toBe(60000);
    expect(calendarSyncBackoffMs(1, 60_000, 3_600_000)).toBe(60000);
    expect(calendarSyncBackoffMs(3, 60_000, 3_600_000)).toBe(240000);
    expect(calendarSyncBackoffMs(6, 60_000, 3_600_000)).toBe(1920000);
    expect(calendarSyncBackoffMs(12, 60_000, 3_600_000)).toBe(3600000);
  });

  it('redacts provider tokens like the legacy worker', () => {
    expect(
      redactCalendarSyncError(new Error('Bearer ya29.a0AfB_secret leaked')),
    ).toBe('Bearer [redacted] leaked');
    expect(
      redactCalendarSyncError(new Error('refresh_token: "1//abc-def" rejected')),
    ).toBe('[redacted-token]" rejected');
    expect(redactCalendarSyncError(null)).toBe('Calendar sync failed');
    expect(redactCalendarSyncError(new Error('x'.repeat(700)))).toHaveLength(500);
  });

  it('normalizes external events with the legacy filtering rules', () => {
    expect(
      normalizeExternalEvent({
        id: 'evt1',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T11:00:00Z',
      }),
    ).toEqual({
      id: 'evt1',
      start: new Date('2026-09-01T10:00:00Z'),
      end: new Date('2026-09-01T11:00:00Z'),
    });
    expect(
      normalizeExternalEvent({
        id: 'evt2',
        status: 'cancelled',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T11:00:00Z',
      }),
    ).toBeNull();
    expect(
      normalizeExternalEvent({
        id: 'evt3',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T11:00:00Z',
        extendedProperties: { private: { itemize_booking_id: '9' } },
      }),
    ).toBeNull();
    expect(
      normalizeExternalEvent({ id: 'evt4', start: 'garbage', end: '2026-09-01T11:00:00Z' }),
    ).toBeNull();
    expect(
      normalizeExternalEvent({
        id: 'evt5',
        start: '2026-09-01T11:00:00Z',
        end: '2026-09-01T10:00:00Z',
      }),
    ).toBeNull();
    expect(normalizeExternalEvent(null)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeExternalEvent({ start: 'x', end: 'y' } as any)).toBeNull();
    const longId = normalizeExternalEvent({
      id: `evt6-${'x'.repeat(300)}`,
      start: '2026-09-01T10:00:00Z',
      end: '2026-09-01T11:00:00Z',
    });
    expect(longId?.id).toHaveLength(255);
  });
});
