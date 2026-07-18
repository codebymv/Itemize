import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  AvailabilityWindowRow,
  CalendarDateOverrideRow,
  CalendarRow,
  CalendarsRepository,
} from './calendars.repository';
import {
  Calendar,
  CalendarAvailabilityWindow,
  CalendarDateOverride,
} from './calendar.types';

@Injectable()
export class CalendarsService {
  constructor(private readonly calendars: CalendarsRepository) {}

  async list(organizationId: number): Promise<Calendar[]> {
    return (await this.calendars.findAll(organizationId)).map((row) =>
      this.mapCalendar(row, [], []),
    );
  }

  async get(organizationId: number, calendarId: number): Promise<Calendar> {
    this.id(calendarId);
    const result = await this.calendars.findById(organizationId, calendarId);
    if (!result) {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    return this.mapCalendar(
      result.calendar,
      result.availabilityWindows,
      result.dateOverrides,
    );
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Calendar ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_CALENDAR_ID' },
      );
    }
  }

  private mapCalendar(
    row: CalendarRow,
    availabilityWindows: AvailabilityWindowRow[],
    dateOverrides: CalendarDateOverrideRow[],
  ): Calendar {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      name: row.name,
      description: row.description,
      slug: row.slug,
      timezone: row.timezone,
      durationMinutes: Number(row.duration_minutes),
      bufferBeforeMinutes: Number(row.buffer_before_minutes),
      bufferAfterMinutes: Number(row.buffer_after_minutes),
      minNoticeHours: Number(row.min_notice_hours),
      maxFutureDays: Number(row.max_future_days),
      assignedToId:
        row.assigned_to === null ? null : Number(row.assigned_to),
      assignedToName: row.assigned_to_name,
      assignmentMode: row.assignment_mode,
      confirmationEmail: row.confirmation_email,
      reminderEmail: row.reminder_email,
      reminderHours: Number(row.reminder_hours),
      color: row.color,
      isActive: row.is_active,
      createdById: row.created_by === null ? null : Number(row.created_by),
      upcomingBookings:
        row.upcoming_bookings === null
          ? null
          : Number(row.upcoming_bookings),
      availabilityWindows: availabilityWindows.map(this.mapAvailabilityWindow),
      dateOverrides: dateOverrides.map(this.mapDateOverride),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private readonly mapAvailabilityWindow = (
    row: AvailabilityWindowRow,
  ): CalendarAvailabilityWindow => ({
    id: Number(row.id),
    calendarId: Number(row.calendar_id),
    dayOfWeek: Number(row.day_of_week),
    startTime: row.start_time,
    endTime: row.end_time,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  });

  private readonly mapDateOverride = (
    row: CalendarDateOverrideRow,
  ): CalendarDateOverride => ({
    id: Number(row.id),
    calendarId: Number(row.calendar_id),
    overrideDate:
      row.override_date instanceof Date
        ? row.override_date.toISOString().slice(0, 10)
        : row.override_date,
    isAvailable: row.is_available,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
    createdAt: new Date(row.created_at),
  });
}
