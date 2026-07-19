import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { BookingFilterInput } from './booking.inputs';
import { Booking, BookingPage } from './booking.types';
import { BookingRow, BookingsRepository } from './bookings.repository';

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
