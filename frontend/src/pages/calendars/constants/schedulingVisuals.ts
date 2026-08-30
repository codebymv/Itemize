import {
  CalendarCheck2,
  CalendarOff,
  CheckCircle2,
  Clock3,
  UserX,
  XCircle,
} from 'lucide-react';
import { defineStatus, getUnknownStatusVisual, type StatusVisual } from '@/lib/statusVisuals';
import type { Booking } from '@/types';

const BOOKING_STATUS_VISUALS: Record<Booking['status'], StatusVisual> = {
  pending: defineStatus('Pending', 'orange', Clock3),
  confirmed: defineStatus('Confirmed', 'blue', CalendarCheck2),
  cancelled: defineStatus('Cancelled', 'red', XCircle),
  completed: defineStatus('Completed', 'green', CheckCircle2),
  no_show: defineStatus('No show', 'gray', UserX),
};

const CALENDAR_STATUS_VISUALS = {
  active: defineStatus('Active', 'blue', CalendarCheck2),
  inactive: defineStatus('Paused', 'orange', CalendarOff),
} as const;

export function getBookingStatusVisual(status: string): StatusVisual {
  return BOOKING_STATUS_VISUALS[status as Booking['status']] ?? getUnknownStatusVisual(status);
}

export function getCalendarStatusVisual(isActive: boolean): StatusVisual {
  return CALENDAR_STATUS_VISUALS[isActive ? 'active' : 'inactive'];
}
