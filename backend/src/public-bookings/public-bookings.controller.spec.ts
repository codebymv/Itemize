import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import request from 'supertest';
import { PublicBookingsController } from './public-bookings.controller';
import { PublicBookingsRepository } from './public-bookings.repository';
import { PublicBookingsService } from './public-bookings.service';

describe('PublicBookingsController retained HTTP contract', () => {
  let app: INestApplication;
  const previousJwtSecret = process.env.JWT_SECRET;
  const repository = {
    publicCalendar: jest.fn(),
    publicSlots: jest.fn(),
    createPublicBooking: jest.fn(),
    cancelPublicBooking: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'public-booking-controller-test-secret';
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicBookingsController],
      providers: [
        PublicBookingsService,
        { provide: PublicBookingsRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const calendarRow = {
    id: 5,
    name: 'Intro Call',
    description: null,
    slug: 'intro-call',
    public_id: 'cal_abc123',
    timezone: 'America/New_York',
    duration_minutes: 30,
    min_notice_hours: 4,
    max_future_days: 60,
    color: '#336699',
    is_active: true,
    organization_name: 'Acme',
  };

  it('serves the public booking page with availability windows', async () => {
    repository.publicCalendar.mockResolvedValue({
      calendar: calendarRow,
      availability: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
      ],
    });
    const response = await request(app.getHttpServer())
      .get('/api/bookings/public/book/cal_abc123')
      .expect(200);
    expect(response.body).toEqual({
      ...calendarRow,
      availability: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
      ],
    });
  });

  it('conceals unknown and ambiguous booking identifiers as not found', async () => {
    repository.publicCalendar.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get('/api/bookings/public/book/unknown')
      .expect(404);
    expect(response.body).toEqual({ error: 'Calendar not found' });
  });

  it('maps page read failures to the retained 500 envelope', async () => {
    repository.publicCalendar.mockRejectedValue(new Error('boom'));
    const response = await request(app.getHttpServer())
      .get('/api/bookings/public/book/cal_abc123')
      .expect(500);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Failed to load booking page', code: 'ERROR' },
    });
  });

  it('rejects malformed slot date ranges before resolving the calendar', async () => {
    for (const query of [
      '',
      'start_date=2026-13-40',
      'start_date=2026-09-02&end_date=2026-09-01',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/bookings/public/book/cal_abc123/slots?${query}`)
        .expect(400);
      expect(response.body).toEqual({
        error: 'start_date and end_date must form a valid ISO date range',
      });
    }
    expect(repository.publicSlots).not.toHaveBeenCalled();
  });

  it('bounds slot queries to 31 calendar days', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/bookings/public/book/cal_abc123/slots?start_date=2026-09-01&end_date=2026-10-15',
      )
      .expect(400);
    expect(response.body).toEqual({
      error: 'Slot queries are limited to 31 calendar days',
    });
    expect(repository.publicSlots).not.toHaveBeenCalled();
  });

  it('serves slots with the policy projection and defaults end date to start date', async () => {
    repository.publicSlots.mockResolvedValue({
      calendar: calendarRow,
      slots: [
        {
          start_time: new Date('2026-09-01T13:00:00.000Z'),
          end_time: new Date('2026-09-01T13:30:00.000Z'),
        },
      ],
    });
    const response = await request(app.getHttpServer())
      .get('/api/bookings/public/book/cal_abc123/slots?start_date=2026-09-01')
      .expect(200);
    expect(repository.publicSlots).toHaveBeenCalledWith(
      'cal_abc123',
      '2026-09-01',
      '2026-09-01',
    );
    expect(response.body).toEqual({
      calendar: {
        id: 5,
        duration_minutes: 30,
        min_notice_hours: 4,
        max_future_days: 60,
        timezone: 'America/New_York',
      },
      slots: [
        {
          start_time: '2026-09-01T13:00:00.000Z',
          end_time: '2026-09-01T13:30:00.000Z',
        },
      ],
    });
  });

  it('requires the mandatory booking fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .set('idempotency-key', 'slot-conflict-request')
      .send({ attendee_name: 'Sam' })
      .expect(400);
    expect(response.body).toEqual({
      error: 'start_time, attendee_name, and attendee_email are required',
    });
    expect(repository.createPublicBooking).not.toHaveBeenCalled();
  });

  it('rejects an unparseable start_time', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .send({
        start_time: 'not-a-time',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      })
      .expect(400);
    expect(response.body).toEqual({
      error: 'start_time must be a valid timestamp',
    });
  });

  it('returns the conflict reason when the slot policy rejects the booking', async () => {
    repository.createPublicBooking.mockResolvedValue({
      kind: 'slot_unavailable',
      reason: 'booking_conflict',
    });
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .set('idempotency-key', 'slot-policy-conflict-request')
      .send({
        start_time: '2026-09-01T13:00:00.000Z',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      })
      .expect(409);
    expect(response.body).toEqual({
      error: 'This time slot is no longer available',
      reason: 'booking_conflict',
    });
  });

  it('creates a booking and returns the cancellation capability exactly once', async () => {
    repository.createPublicBooking.mockResolvedValue({
      kind: 'created',
      replayed: false,
      booking: {
        id: 42,
        start_time: new Date('2026-09-01T13:00:00.000Z'),
        end_time: new Date('2026-09-01T13:30:00.000Z'),
        timezone: 'America/New_York',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .set('idempotency-key', 'created-booking-request')
      .send({
        start_time: '2026-09-01T13:00:00.000Z',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      })
      .expect(201);
    expect(response.body).toMatchObject({
      success: true,
      replayed: false,
      message: 'Booking confirmed! Check your email for confirmation details.',
      booking: {
        id: 42,
        attendee_email: 'sam@example.com',
        cancellation_token: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const [, values] = repository.createPublicBooking.mock.calls[0];
    const expectedHash = crypto
      .createHash('sha256')
      .update(response.body.booking.cancellation_token, 'utf8')
      .digest('hex');
    expect(values.cancellationTokenHash).toBe(expectedHash);
  });

  it('maps booking write failures to the retained 500 envelope', async () => {
    repository.createPublicBooking.mockRejectedValue(new Error('deadlock'));
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .set('idempotency-key', 'failed-booking-request')
      .send({
        start_time: '2026-09-01T13:00:00.000Z',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      })
      .expect(500);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Failed to create booking', code: 'ERROR' },
    });
  });

  it('requires a safe idempotency key for otherwise valid bookings', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123')
      .send({
        start_time: '2026-09-01T13:00:00.000Z',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      })
      .expect(400);
    expect(response.body).toMatchObject({ code: 'INVALID_IDEMPOTENCY_KEY' });
    expect(repository.createPublicBooking).not.toHaveBeenCalled();
  });

  it('rejects malformed cancellation capabilities without touching the database', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bookings/public/book/cal_abc123/cancel/not-a-token')
      .send({})
      .expect(404);
    expect(response.body).toEqual({
      error: 'Booking not found or already cancelled',
    });
    expect(repository.cancelPublicBooking).not.toHaveBeenCalled();
  });

  it('cancels with the hashed capability and a defaulted reason', async () => {
    repository.cancelPublicBooking.mockResolvedValue({ kind: 'cancelled' });
    const token = 'ab'.repeat(32);
    const response = await request(app.getHttpServer())
      .post(`/api/bookings/public/book/cal_abc123/cancel/${token}`)
      .send({})
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Your booking has been cancelled.',
    });
    expect(repository.cancelPublicBooking).toHaveBeenCalledWith(
      'cal_abc123',
      crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
      'Cancelled by attendee',
    );
  });

  it('shares one non-enumerating miss for unknown, replayed, and expired capabilities', async () => {
    repository.cancelPublicBooking.mockResolvedValue({ kind: 'not_found' });
    const response = await request(app.getHttpServer())
      .post(`/api/bookings/public/book/cal_abc123/cancel/${'cd'.repeat(32)}`)
      .send({ reason: 'Changed plans' })
      .expect(404);
    expect(response.body).toEqual({
      error: 'Booking not found or already cancelled',
    });
    expect(repository.cancelPublicBooking).toHaveBeenCalledWith(
      'cal_abc123',
      expect.any(String),
      'Changed plans',
    );
  });
});
