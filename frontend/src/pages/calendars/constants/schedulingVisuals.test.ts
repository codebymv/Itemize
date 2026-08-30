import { describe, expect, it } from 'vitest';
import {
  CalendarCheck2,
  CalendarOff,
  CheckCircle2,
  Clock3,
  UserX,
  XCircle,
} from 'lucide-react';
import { getBookingStatusVisual, getCalendarStatusVisual } from './schedulingVisuals';

describe('scheduling visual semantics', () => {
  it.each([
    ['pending', 'Pending', 'orange', Clock3],
    ['confirmed', 'Confirmed', 'blue', CalendarCheck2],
    ['cancelled', 'Cancelled', 'red', XCircle],
    ['completed', 'Completed', 'green', CheckCircle2],
    ['no_show', 'No show', 'gray', UserX],
  ] as const)('maps %s bookings to the shared status grammar', (status, label, theme, icon) => {
    const visual = getBookingStatusVisual(status);

    expect(visual).toMatchObject({ label, theme, icon });
  });

  it('uses blue for available calendars and orange for paused calendars', () => {
    expect(getCalendarStatusVisual(true)).toMatchObject({
      label: 'Active',
      theme: 'blue',
      icon: CalendarCheck2,
    });
    expect(getCalendarStatusVisual(false)).toMatchObject({
      label: 'Paused',
      theme: 'orange',
      icon: CalendarOff,
    });
  });
});
