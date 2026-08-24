import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PublicBookingsRepository } from './public-bookings.repository';

const CANCELLATION_TOKEN = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const calendarNotFound = () =>
  new NotFoundException({ error: 'Calendar not found' });

const serverFailure = (message: string) =>
  new InternalServerErrorException({
    success: false,
    error: { message, code: 'ERROR' },
  });

type CreatePublicBookingBody = {
  start_time?: unknown;
  end_time?: unknown;
  timezone?: unknown;
  attendee_name?: unknown;
  attendee_email?: unknown;
  attendee_phone?: unknown;
  notes?: unknown;
  custom_fields?: unknown;
};

@Injectable()
export class PublicBookingsService {
  private readonly logger = new Logger(PublicBookingsService.name);

  constructor(private readonly repository: PublicBookingsRepository) {}

  async getPublicBookingPage(identifier: string) {
    const data = await this.guard(
      () => this.repository.publicCalendar(identifier),
      'Error fetching public calendar',
      'Failed to load booking page',
    );
    if (!data) throw calendarNotFound();
    return { ...data.calendar, availability: data.availability };
  }

  async getPublicBookingSlots(
    identifier: string,
    startDate: unknown,
    endDate: unknown,
  ) {
    const parsedStart = this.parseDate(startDate);
    const resolvedEnd = endDate || startDate;
    const parsedEnd = this.parseDate(resolvedEnd);
    if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
      throw new BadRequestException({
        error: 'start_date and end_date must form a valid ISO date range',
      });
    }
    const dayRange = Math.round(
      (parsedEnd.getTime() - parsedStart.getTime()) / 86400000,
    );
    if (dayRange > 30) {
      throw new BadRequestException({
        error: 'Slot queries are limited to 31 calendar days',
      });
    }

    const data = await this.guard(
      () =>
        this.repository.publicSlots(
          identifier,
          String(startDate),
          String(resolvedEnd),
        ),
      'Error fetching available slots',
      'Failed to fetch available slots',
    );
    if (!data) throw calendarNotFound();
    return {
      calendar: {
        id: data.calendar.id,
        duration_minutes: data.calendar.duration_minutes,
        min_notice_hours: data.calendar.min_notice_hours,
        max_future_days: data.calendar.max_future_days,
        timezone: data.calendar.timezone,
      },
      slots: data.slots,
    };
  }

  async createPublicBooking(identifier: string, body: CreatePublicBookingBody) {
    const startTime = body.start_time;
    const attendeeName = body.attendee_name;
    const attendeeEmail = body.attendee_email;
    if (!startTime || !attendeeName || !attendeeEmail) {
      throw new BadRequestException({
        error: 'start_time, attendee_name, and attendee_email are required',
      });
    }
    if (Number.isNaN(new Date(String(startTime)).getTime())) {
      throw new BadRequestException({
        error: 'start_time must be a valid timestamp',
      });
    }

    const cancellationToken = crypto.randomBytes(32).toString('hex');
    const outcome = await this.guard(
      () =>
        this.repository.createPublicBooking(identifier, {
          startTime: String(startTime),
          endTime: body.end_time ? String(body.end_time) : null,
          timezone: body.timezone ? String(body.timezone) : null,
          attendeeName: String(attendeeName),
          attendeeEmail: String(attendeeEmail),
          attendeePhone: body.attendee_phone ? String(body.attendee_phone) : null,
          notes: body.notes ? String(body.notes) : null,
          customFields:
            body.custom_fields && typeof body.custom_fields === 'object'
              ? (body.custom_fields as Record<string, unknown>)
              : {},
          cancellationTokenHash: this.hashToken(cancellationToken),
        }),
      'Error creating public booking',
      'Failed to create booking',
    );

    if (outcome.kind === 'calendar_not_found') throw calendarNotFound();
    if (outcome.kind === 'invalid_time_range') {
      throw new BadRequestException({
        error: 'start_time and end_time must form a valid time range',
      });
    }
    if (outcome.kind === 'slot_unavailable') {
      throw new ConflictException({
        error: 'This time slot is no longer available',
        reason: outcome.reason,
      });
    }
    return {
      success: true,
      booking: { ...outcome.booking, cancellation_token: cancellationToken },
      message: 'Booking confirmed! Check your email for confirmation details.',
    };
  }

  async cancelPublicBooking(
    identifier: string,
    token: string,
    reason: unknown,
  ) {
    if (!CANCELLATION_TOKEN.test(token)) {
      throw new NotFoundException({
        error: 'Booking not found or already cancelled',
      });
    }
    const outcome = await this.guard(
      () =>
        this.repository.cancelPublicBooking(
          identifier,
          this.hashToken(token),
          reason ? String(reason) : 'Cancelled by attendee',
        ),
      'Error cancelling booking',
      'Failed to cancel booking',
    );
    if (outcome.kind === 'not_found') {
      throw new NotFoundException({
        error: 'Booking not found or already cancelled',
      });
    }
    return { success: true, message: 'Your booking has been cancelled.' };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private parseDate(value: unknown): Date | null {
    if (!ISO_DATE.test(String(value || ''))) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? parsed
      : null;
  }

  private async guard<T>(
    read: () => Promise<T>,
    logMessage: string,
    failureMessage: string,
  ): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`${logMessage}: ${(error as Error).message}`);
      throw serverFailure(failureMessage);
    }
  }
}
