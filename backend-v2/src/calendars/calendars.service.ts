import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CalendarAvailabilityWindowInput,
  CalendarDateOverrideInput,
  CreateCalendarInput,
  UpdateCalendarInput,
} from './calendar.inputs';
import {
  AvailabilityWindowRow,
  CalendarAvailabilityWindowValue,
  CalendarDateOverrideValue,
  CalendarDateOverrideRow,
  CalendarRow,
  CalendarsRepository,
  UpdateCalendarValues,
} from './calendars.repository';
import {
  Calendar,
  CalendarAvailabilityWindow,
  CalendarDateOverride,
} from './calendar.types';

const ASSIGNMENT_MODES = new Set(['specific', 'round_robin']);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

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

  async create(
    organizationId: number,
    userId: number,
    input: CreateCalendarInput,
  ): Promise<Calendar> {
    const assignmentMode = this.assignmentMode(
      input.assignmentMode ?? 'specific',
    );
    const assignedToId =
      input.assignedToId !== undefined
        ? this.nullableId(input.assignedToId, 'assignedToId')
        : assignmentMode === 'round_robin'
          ? null
          : userId;
    const availabilityWindows =
      input.availabilityWindows == null
        ? this.defaultAvailabilityWindows()
        : this.availabilityWindows(input.availabilityWindows);
    const outcome = await this.calendars.create(organizationId, userId, {
      name: this.text(input.name, 'name', 255),
      description: this.nullableText(input.description, 'description', 10000),
      slug: this.slug(input.name),
      timezone: this.timezone(input.timezone ?? 'America/New_York'),
      durationMinutes: this.integer(
        input.durationMinutes ?? 30,
        'durationMinutes',
        1,
        1440,
      ),
      bufferBeforeMinutes: this.integer(
        input.bufferBeforeMinutes ?? 0,
        'bufferBeforeMinutes',
        0,
        1440,
      ),
      bufferAfterMinutes: this.integer(
        input.bufferAfterMinutes ?? 0,
        'bufferAfterMinutes',
        0,
        1440,
      ),
      minNoticeHours: this.integer(
        input.minNoticeHours ?? 24,
        'minNoticeHours',
        0,
        8760,
      ),
      maxFutureDays: this.integer(
        input.maxFutureDays ?? 60,
        'maxFutureDays',
        1,
        3650,
      ),
      assignedToId,
      assignmentMode,
      confirmationEmail: input.confirmationEmail ?? true,
      reminderEmail: input.reminderEmail ?? true,
      reminderHours: this.integer(
        input.reminderHours ?? 24,
        'reminderHours',
        0,
        8760,
      ),
      color: this.color(input.color ?? '#3B82F6'),
      isActive: input.isActive ?? true,
      availabilityWindows,
    });
    if (outcome.kind === 'limit') {
      throw itemizeGraphqlError(
        `You've reached your calendar limit (${outcome.limit.current}/${outcome.limit.limit}). Please upgrade your plan.`,
        'FORBIDDEN',
        {
          reason: 'PLAN_LIMIT_REACHED',
          current: outcome.limit.current,
          limit: outcome.limit.limit,
          plan: outcome.limit.plan,
        },
      );
    }
    this.throwAssignmentOutcome(outcome.kind);
    return this.mapCalendar(
      outcome.value.calendar,
      outcome.value.availabilityWindows,
      outcome.value.dateOverrides,
    );
  }

  async update(
    organizationId: number,
    calendarId: number,
    input: UpdateCalendarInput,
  ): Promise<Calendar> {
    this.id(calendarId);
    for (const key of [
      'name',
      'timezone',
      'durationMinutes',
      'bufferBeforeMinutes',
      'bufferAfterMinutes',
      'minNoticeHours',
      'maxFutureDays',
      'assignmentMode',
      'confirmationEmail',
      'reminderEmail',
      'reminderHours',
      'color',
      'isActive',
    ] as const) {
      if (input[key] === null) {
        throw itemizeGraphqlError(`${key} cannot be null`, 'BAD_USER_INPUT', {
          field: key,
          reason: 'NULL_CALENDAR_FIELD',
        });
      }
    }
    const values: UpdateCalendarValues = {
      ...(input.name !== undefined
        ? { name: this.text(input.name as string, 'name', 255) }
        : {}),
      ...(input.description !== undefined
        ? {
            description: this.nullableText(
              input.description,
              'description',
              10000,
            ),
          }
        : {}),
      ...(input.timezone !== undefined
        ? { timezone: this.timezone(input.timezone as string) }
        : {}),
      ...(input.durationMinutes !== undefined
        ? {
            durationMinutes: this.integer(
              input.durationMinutes as number,
              'durationMinutes',
              1,
              1440,
            ),
          }
        : {}),
      ...(input.bufferBeforeMinutes !== undefined
        ? {
            bufferBeforeMinutes: this.integer(
              input.bufferBeforeMinutes as number,
              'bufferBeforeMinutes',
              0,
              1440,
            ),
          }
        : {}),
      ...(input.bufferAfterMinutes !== undefined
        ? {
            bufferAfterMinutes: this.integer(
              input.bufferAfterMinutes as number,
              'bufferAfterMinutes',
              0,
              1440,
            ),
          }
        : {}),
      ...(input.minNoticeHours !== undefined
        ? {
            minNoticeHours: this.integer(
              input.minNoticeHours as number,
              'minNoticeHours',
              0,
              8760,
            ),
          }
        : {}),
      ...(input.maxFutureDays !== undefined
        ? {
            maxFutureDays: this.integer(
              input.maxFutureDays as number,
              'maxFutureDays',
              1,
              3650,
            ),
          }
        : {}),
      ...(input.assignedToId !== undefined
        ? {
            assignedToId: this.nullableId(input.assignedToId, 'assignedToId'),
          }
        : {}),
      ...(input.assignmentMode !== undefined
        ? {
            assignmentMode: this.assignmentMode(input.assignmentMode as string),
          }
        : {}),
      ...(input.confirmationEmail !== undefined
        ? { confirmationEmail: input.confirmationEmail as boolean }
        : {}),
      ...(input.reminderEmail !== undefined
        ? { reminderEmail: input.reminderEmail as boolean }
        : {}),
      ...(input.reminderHours !== undefined
        ? {
            reminderHours: this.integer(
              input.reminderHours as number,
              'reminderHours',
              0,
              8760,
            ),
          }
        : {}),
      ...(input.color !== undefined
        ? { color: this.color(input.color as string) }
        : {}),
      ...(input.isActive !== undefined
        ? { isActive: input.isActive as boolean }
        : {}),
    };
    const outcome = await this.calendars.update(
      organizationId,
      calendarId,
      values,
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    this.throwAssignmentOutcome(outcome.kind);
    return this.mapCalendar(
      outcome.value.calendar,
      outcome.value.availabilityWindows,
      outcome.value.dateOverrides,
    );
  }

  async delete(organizationId: number, calendarId: number): Promise<boolean> {
    this.id(calendarId);
    const outcome = await this.calendars.delete(organizationId, calendarId);
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'upcoming_bookings') {
      throw itemizeGraphqlError(
        'Cannot delete calendar with upcoming bookings. Cancel bookings first.',
        'BAD_USER_INPUT',
        { reason: 'UPCOMING_BOOKINGS' },
      );
    }
    return true;
  }

  async replaceAvailability(
    organizationId: number,
    calendarId: number,
    input: CalendarAvailabilityWindowInput[],
  ): Promise<CalendarAvailabilityWindow[]> {
    this.id(calendarId);
    const outcome = await this.calendars.replaceAvailability(
      organizationId,
      calendarId,
      this.availabilityWindows(input),
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    return outcome.value.map(this.mapAvailabilityWindow);
  }

  async upsertDateOverride(
    organizationId: number,
    calendarId: number,
    input: CalendarDateOverrideInput,
  ): Promise<CalendarDateOverride> {
    this.id(calendarId);
    const isAvailable = input.isAvailable ?? false;
    const startTime =
      input.startTime == null ? null : this.time(input.startTime, 'startTime');
    const endTime =
      input.endTime == null ? null : this.time(input.endTime, 'endTime');
    if (isAvailable && (startTime === null || endTime === null)) {
      throw itemizeGraphqlError(
        'Available date overrides require startTime and endTime',
        'BAD_USER_INPUT',
        { field: 'input', reason: 'OVERRIDE_WINDOW_REQUIRED' },
      );
    }
    if (!isAvailable && (startTime !== null || endTime !== null)) {
      throw itemizeGraphqlError(
        'Unavailable date overrides cannot include a time window',
        'BAD_USER_INPUT',
        { field: 'input', reason: 'UNAVAILABLE_OVERRIDE_WINDOW' },
      );
    }
    if (startTime !== null && endTime !== null && startTime >= endTime) {
      throw itemizeGraphqlError(
        'Date override startTime must be before endTime',
        'BAD_USER_INPUT',
        { field: 'input', reason: 'INVALID_OVERRIDE_WINDOW' },
      );
    }
    const values: CalendarDateOverrideValue = {
      overrideDate: this.date(input.overrideDate, 'overrideDate'),
      isAvailable,
      startTime,
      endTime,
      reason: this.nullableText(input.reason, 'reason', 255),
    };
    const outcome = await this.calendars.upsertDateOverride(
      organizationId,
      calendarId,
      values,
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    return this.mapDateOverride(outcome.value);
  }

  async deleteDateOverride(
    organizationId: number,
    calendarId: number,
    overrideId: number,
  ): Promise<boolean> {
    this.id(calendarId);
    this.positiveId(overrideId, 'overrideId');
    const outcome = await this.calendars.deleteDateOverride(
      organizationId,
      calendarId,
      overrideId,
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Date override not found', 'NOT_FOUND');
    }
    return true;
  }

  private id(value: number): void {
    this.positiveId(value, 'id', 'INVALID_CALENDAR_ID');
  }

  private positiveId(
    value: number,
    field: string,
    reason = 'INVALID_ID',
  ): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        `${field} must be a positive integer`,
        'BAD_USER_INPUT',
        { field, reason },
      );
    }
  }

  private text(value: string, field: string, max: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain between 1 and ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_CALENDAR_FIELD' },
      );
    }
    return normalized;
  }

  private nullableText(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === null || value === undefined || value.trim() === '') {
      return null;
    }
    if (value.trim().length > max) {
      throw itemizeGraphqlError(
        `${field} must contain no more than ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_CALENDAR_FIELD' },
      );
    }
    return value.trim();
  }

  private integer(
    value: number,
    field: string,
    minimum: number,
    maximum: number,
  ): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw itemizeGraphqlError(
        `${field} must be an integer between ${minimum} and ${maximum}`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_CALENDAR_FIELD' },
      );
    }
    return value;
  }

  private nullableId(value: number | null, field: string): number | null {
    if (value === null) return null;
    this.integer(value, field, 1, Number.MAX_SAFE_INTEGER);
    return value;
  }

  private assignmentMode(value: string): string {
    if (!ASSIGNMENT_MODES.has(value)) {
      throw itemizeGraphqlError(
        'assignmentMode must be specific or round_robin',
        'BAD_USER_INPUT',
        { field: 'assignmentMode', reason: 'INVALID_ASSIGNMENT_MODE' },
      );
    }
    return value;
  }

  private timezone(value: string): string {
    const normalized = this.text(value, 'timezone', 100);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
    } catch {
      throw itemizeGraphqlError(
        'timezone must be a valid IANA timezone',
        'BAD_USER_INPUT',
        { field: 'timezone', reason: 'INVALID_TIMEZONE' },
      );
    }
    return normalized;
  }

  private color(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      throw itemizeGraphqlError(
        'color must be a six-digit hexadecimal color',
        'BAD_USER_INPUT',
        { field: 'color', reason: 'INVALID_COLOR' },
      );
    }
    return normalized;
  }

  private availabilityWindows(
    input: CalendarAvailabilityWindowInput[],
  ): CalendarAvailabilityWindowValue[] {
    if (input.length > 100) {
      throw itemizeGraphqlError(
        'availabilityWindows cannot contain more than 100 windows',
        'BAD_USER_INPUT',
        { field: 'availabilityWindows', reason: 'TOO_MANY_WINDOWS' },
      );
    }
    const windows = input.map((window, index) => ({
      dayOfWeek: this.integer(
        window.dayOfWeek,
        `availabilityWindows[${index}].dayOfWeek`,
        0,
        6,
      ),
      startTime: this.time(
        window.startTime,
        `availabilityWindows[${index}].startTime`,
      ),
      endTime: this.time(
        window.endTime,
        `availabilityWindows[${index}].endTime`,
      ),
      isActive: window.isActive ?? true,
    }));
    windows.sort(
      (left, right) =>
        left.dayOfWeek - right.dayOfWeek ||
        left.startTime.localeCompare(right.startTime) ||
        left.endTime.localeCompare(right.endTime),
    );
    for (let index = 0; index < windows.length; index += 1) {
      const window = windows[index];
      if (window.startTime >= window.endTime) {
        throw itemizeGraphqlError(
          'Availability window startTime must be before endTime',
          'BAD_USER_INPUT',
          { field: 'availabilityWindows', reason: 'INVALID_WINDOW_RANGE' },
        );
      }
      const previous = windows[index - 1];
      if (
        previous &&
        previous.dayOfWeek === window.dayOfWeek &&
        previous.endTime > window.startTime
      ) {
        throw itemizeGraphqlError(
          'Availability windows cannot overlap on the same day',
          'BAD_USER_INPUT',
          { field: 'availabilityWindows', reason: 'OVERLAPPING_WINDOWS' },
        );
      }
    }
    return windows;
  }

  private time(value: string, field: string): string {
    const match = TIME_PATTERN.exec(value.trim());
    if (!match) {
      throw itemizeGraphqlError(
        `${field} must be a valid 24-hour time`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_TIME' },
      );
    }
    return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
  }

  private date(value: string, field: string): string {
    const normalized = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    if (!match) {
      throw itemizeGraphqlError(
        `${field} must be an ISO calendar date`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_DATE' },
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw itemizeGraphqlError(
        `${field} must be an ISO calendar date`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_DATE' },
      );
    }
    return normalized;
  }

  private defaultAvailabilityWindows(): CalendarAvailabilityWindowValue[] {
    return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00:00',
      endTime: '17:00:00',
      isActive: true,
    }));
  }

  private slug(name: string): string {
    const prefix =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 180) || 'calendar';
    return `${prefix}-${randomBytes(8).toString('hex')}`;
  }

  private throwAssignmentOutcome(
    kind: 'created' | 'updated' | 'invalid_assignee' | 'assignee_required',
  ): asserts kind is 'created' | 'updated' {
    if (kind === 'invalid_assignee') {
      throw itemizeGraphqlError(
        'assignedToId must identify a member of this organization',
        'BAD_USER_INPUT',
        { field: 'assignedToId', reason: 'INVALID_ASSIGNEE' },
      );
    }
    if (kind === 'assignee_required') {
      throw itemizeGraphqlError(
        'assignedToId is required for specific assignment',
        'BAD_USER_INPUT',
        { field: 'assignedToId', reason: 'ASSIGNEE_REQUIRED' },
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
      assignedToId: row.assigned_to === null ? null : Number(row.assigned_to),
      assignedToName: row.assigned_to_name,
      assignmentMode: row.assignment_mode,
      confirmationEmail: row.confirmation_email,
      reminderEmail: row.reminder_email,
      reminderHours: Number(row.reminder_hours),
      color: row.color,
      isActive: row.is_active,
      createdById: row.created_by === null ? null : Number(row.created_by),
      upcomingBookings:
        row.upcoming_bookings === null ? null : Number(row.upcoming_bookings),
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
