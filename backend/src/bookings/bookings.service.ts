import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  BookingFilterInput,
  CreateBookingInput,
  RescheduleBookingInput,
} from './booking.inputs';
import { Booking, BookingPage } from './booking.types';
import { BookingRow, BookingsRepository } from './bookings.repository';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CUSTOM_FIELDS_BYTES = 64 * 1024;

@Injectable()
export class BookingsService {
  constructor(private readonly bookings: BookingsRepository) {}

  async list(
    organizationId: number,
    filter: BookingFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<BookingPage> {
    const normalizedPage = this.page(page);
    for (const field of [
      'calendarId',
      'contactId',
      'assignedToId',
    ] as const) {
      if (filter[field] !== undefined) this.id(filter[field], field);
    }
    if (
      filter.startDate !== undefined &&
      filter.endDate !== undefined &&
      filter.endDate < filter.startDate
    ) {
      throw itemizeGraphqlError(
        'endDate must be on or after startDate',
        'BAD_USER_INPUT',
        { field: 'endDate', reason: 'INVALID_DATE_RANGE' },
      );
    }
    const result = await this.bookings.findPage({
      organizationId,
      ...filter,
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(
        normalizedPage.page,
        normalizedPage.pageSize,
        result.total,
      ),
    };
  }

  async get(organizationId: number, bookingId: number): Promise<Booking> {
    this.id(bookingId, 'id');
    const row = await this.bookings.findById(organizationId, bookingId);
    if (!row) throw itemizeGraphqlError('Booking not found', 'NOT_FOUND');
    return this.map(row);
  }

  async create(
    organizationId: number,
    input: CreateBookingInput,
  ): Promise<Booking> {
    const calendarId = this.id(input.calendarId, 'calendarId');
    const contactId = this.optionalId(input.contactId, 'contactId');
    const assignedToId = this.optionalId(input.assignedToId, 'assignedToId');
    const attendeeEmail = this.optionalText(
      input.attendeeEmail,
      'attendeeEmail',
      255,
    );
    if (attendeeEmail && !EMAIL_PATTERN.test(attendeeEmail)) {
      throw itemizeGraphqlError(
        'attendeeEmail must be a valid email address',
        'BAD_USER_INPUT',
        { field: 'attendeeEmail', reason: 'INVALID_EMAIL' },
      );
    }
    this.timeRange(input.startTime, input.endTime);
    const outcome = await this.bookings.create(organizationId, {
      calendarId,
      contactId,
      title: this.optionalText(input.title, 'title', 255),
      startTime: input.startTime,
      endTime: input.endTime,
      timezone:
        input.timezone === null || input.timezone === undefined
          ? 'America/New_York'
          : this.timezone(input.timezone),
      attendeeName: this.optionalText(
        input.attendeeName,
        'attendeeName',
        255,
      ),
      attendeeEmail,
      attendeePhone: this.optionalText(
        input.attendeePhone,
        'attendeePhone',
        50,
      ),
      assignedToId,
      notes: this.optionalText(input.notes, 'notes', 10_000),
      internalNotes: this.optionalText(
        input.internalNotes,
        'internalNotes',
        10_000,
      ),
      customFields: this.record(input.customFields, 'customFields'),
    });
    if (outcome.kind === 'calendar_not_found') {
      throw itemizeGraphqlError('Calendar not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'invalid_contact') {
      throw itemizeGraphqlError(
        'contactId must identify a contact in this organization',
        'BAD_USER_INPUT',
        { field: 'contactId', reason: 'INVALID_CONTACT' },
      );
    }
    if (outcome.kind === 'invalid_assignee') {
      throw itemizeGraphqlError(
        'assignedToId must identify a member of this organization',
        'BAD_USER_INPUT',
        { field: 'assignedToId', reason: 'INVALID_ASSIGNEE' },
      );
    }
    if (outcome.kind === 'slot_unavailable') {
      throw itemizeGraphqlError(
        'Time slot is not available',
        'CONFLICT',
        { field: 'startTime', reason: 'SLOT_UNAVAILABLE' },
      );
    }
    return this.map(outcome.row);
  }

  async cancel(
    organizationId: number,
    bookingId: number,
    reason?: string | null,
  ): Promise<Booking> {
    this.id(bookingId, 'id');
    const normalizedReason = reason?.trim() || null;
    if (normalizedReason && normalizedReason.length > 2000) {
      throw itemizeGraphqlError(
        'reason must be at most 2000 characters',
        'BAD_USER_INPUT',
        { field: 'reason', reason: 'TOO_LONG' },
      );
    }
    const outcome = await this.bookings.cancel(
      organizationId,
      bookingId,
      normalizedReason,
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Booking not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'invalid_status') {
      throw itemizeGraphqlError(
        'Only pending or confirmed bookings can be cancelled',
        'BAD_USER_INPUT',
        {
          field: 'id',
          reason: 'INVALID_BOOKING_STATUS',
        },
      );
    }
    return this.map(outcome.row);
  }

  async reschedule(
    organizationId: number,
    bookingId: number,
    input: RescheduleBookingInput,
  ): Promise<Booking> {
    this.id(bookingId, 'id');
    this.timeRange(input.startTime, input.endTime);
    const timezone =
      input.timezone === null || input.timezone === undefined
        ? null
        : this.timezone(input.timezone);
    const outcome = await this.bookings.reschedule(
      organizationId,
      bookingId,
      input.startTime,
      input.endTime,
      timezone,
    );
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Booking not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'invalid_status') {
      throw itemizeGraphqlError(
        'Only pending or confirmed bookings can be rescheduled',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_BOOKING_STATUS' },
      );
    }
    if (outcome.kind === 'slot_unavailable') {
      throw itemizeGraphqlError(
        'New time slot is not available',
        'CONFLICT',
        { field: 'startTime', reason: 'SLOT_UNAVAILABLE' },
      );
    }
    return this.map(outcome.row);
  }

  private page(input: PageInput): {
    page: number;
    pageSize: number;
    offset: number;
  } {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    if (!Number.isInteger(page) || page < 1) {
      throw itemizeGraphqlError('page must be a positive integer', 'BAD_USER_INPUT', {
        field: 'page',
        reason: 'INVALID_PAGE',
      });
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw itemizeGraphqlError(
        'pageSize must be an integer between 1 and 100',
        'BAD_USER_INPUT',
        { field: 'pageSize', reason: 'INVALID_PAGE_SIZE' },
      );
    }
    return { page, pageSize, offset: (page - 1) * pageSize };
  }

  private id(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_ID',
      });
    }
    return value;
  }

  private optionalId(
    value: number | null | undefined,
    field: string,
  ): number | null {
    if (value === null || value === undefined) return null;
    return this.id(value, field);
  }

  private optionalText(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === null || value === undefined || value.trim() === '') {
      return null;
    }
    const normalized = value.trim();
    if (normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain no more than ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'TOO_LONG' },
      );
    }
    return normalized;
  }

  private timeRange(startTime: Date, endTime: Date): void {
    if (
      !(startTime instanceof Date) ||
      !(endTime instanceof Date) ||
      !Number.isFinite(startTime.getTime()) ||
      !Number.isFinite(endTime.getTime()) ||
      endTime <= startTime
    ) {
      throw itemizeGraphqlError(
        'endTime must be after startTime',
        'BAD_USER_INPUT',
        { field: 'endTime', reason: 'INVALID_TIME_RANGE' },
      );
    }
  }

  private timezone(value: string): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > 100) {
      throw itemizeGraphqlError(
        'timezone must contain between 1 and 100 characters',
        'BAD_USER_INPUT',
        { field: 'timezone', reason: 'INVALID_TIMEZONE' },
      );
    }
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

  private record(
    value: Record<string, unknown> | null | undefined,
    field: string,
  ): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw itemizeGraphqlError(
        `${field} must be an object`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_JSON_OBJECT' },
      );
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw itemizeGraphqlError(
        `${field} must be JSON serializable`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_JSON_OBJECT' },
      );
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CUSTOM_FIELDS_BYTES) {
      throw itemizeGraphqlError(
        `${field} must be at most ${MAX_CUSTOM_FIELDS_BYTES} bytes`,
        'BAD_USER_INPUT',
        { field, reason: 'TOO_LARGE' },
      );
    }
    return value;
  }

  private map(row: BookingRow): Booking {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      calendarId: Number(row.calendar_id),
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      attendeeName: row.attendee_name,
      attendeeEmail: row.attendee_email,
      attendeePhone: row.attendee_phone,
      assignedToId:
        row.assigned_to === null ? null : Number(row.assigned_to),
      assignedToName: row.assigned_to_name,
      status: row.status,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      notes: row.notes,
      internalNotes: row.internal_notes,
      reminderSentAt: row.reminder_sent_at,
      customFields: row.custom_fields ?? {},
      source: row.source,
      calendarName: row.calendar_name,
      calendarColor: row.calendar_color,
      calendarSlug: row.calendar_slug,
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
