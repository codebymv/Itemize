import { GraphQLError } from 'graphql';
import { BookingStatus } from './booking.enums';
import { BookingRow, BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

const row = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: 9,
  organization_id: 3,
  calendar_id: 4,
  contact_id: 5,
  title: 'Consultation',
  start_time: new Date('2026-08-01T17:00:00.000Z'),
  end_time: new Date('2026-08-01T17:30:00.000Z'),
  timezone: 'America/Phoenix',
  attendee_name: 'Ada Lovelace',
  attendee_email: 'ada@example.com',
  attendee_phone: null,
  assigned_to: 7,
  assigned_to_name: 'Owner',
  status: BookingStatus.CONFIRMED,
  cancelled_at: null,
  cancellation_reason: null,
  notes: null,
  internal_notes: null,
  reminder_sent_at: null,
  custom_fields: { channel: 'partner' },
  source: 'manual',
  calendar_name: 'Consultations',
  calendar_color: '#3B82F6',
  calendar_slug: 'consultations',
  contact_first_name: 'Ada',
  contact_last_name: 'Lovelace',
  contact_email: 'ada@example.com',
  contact_phone: null,
  created_at: new Date('2026-07-01T00:00:00.000Z'),
  updated_at: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

describe('BookingsService', () => {
  let repository: jest.Mocked<BookingsRepository>;
  let service: BookingsService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      cancel: jest.fn(),
      reschedule: jest.fn(),
    } as unknown as jest.Mocked<BookingsRepository>;
    service = new BookingsService(repository);
  });

  it('maps tenant-qualified joined data and deterministic page criteria', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 11 });
    const startDate = new Date('2026-08-01T00:00:00.000Z');
    const result = await service.list(
      3,
      {
        calendarId: 4,
        status: BookingStatus.CONFIRMED,
        startDate,
      },
      { page: 2, pageSize: 10 },
    );

    expect(result).toMatchObject({
      nodes: [
        {
          id: 9,
          calendarName: 'Consultations',
          contactEmail: 'ada@example.com',
          customFields: { channel: 'partner' },
        },
      ],
      pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 3,
      calendarId: 4,
      status: BookingStatus.CONFIRMED,
      startDate,
      pageSize: 10,
      offset: 10,
    });
  });

  it.each([
    [{ page: 0, pageSize: 50 }, 'page'],
    [{ page: 1, pageSize: 101 }, 'pageSize'],
  ])('rejects invalid pagination %#', async (page, field) => {
    await expect(service.list(3, {}, page)).rejects.toMatchObject<
      Partial<GraphQLError>
    >({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT', field }),
    });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('rejects a reversed timestamp range before querying', async () => {
    await expect(
      service.list(3, {
        startDate: new Date('2026-08-02T00:00:00.000Z'),
        endDate: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'endDate',
        reason: 'INVALID_DATE_RANGE',
      }),
    });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('keeps foreign booking identifiers tenant-private', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.get(3, 99)).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });

  it('normalizes and creates a tenant-owned manual booking', async () => {
    repository.create.mockResolvedValue({ kind: 'created', row: row() });
    const startTime = new Date('2026-08-01T17:00:00.000Z');
    const endTime = new Date('2026-08-01T17:30:00.000Z');

    await expect(
      service.create(3, {
        calendarId: 4,
        contactId: 5,
        title: '  Consultation  ',
        startTime,
        endTime,
        timezone: ' America/Phoenix ',
        attendeeName: ' Ada Lovelace ',
        attendeeEmail: ' ada@example.com ',
        assignedToId: 7,
        customFields: { channel: 'partner' },
      }),
    ).resolves.toMatchObject({
      id: 9,
      source: 'manual',
      calendarName: 'Consultations',
    });
    expect(repository.create).toHaveBeenCalledWith(3, {
      calendarId: 4,
      contactId: 5,
      title: 'Consultation',
      startTime,
      endTime,
      timezone: 'America/Phoenix',
      attendeeName: 'Ada Lovelace',
      attendeeEmail: 'ada@example.com',
      attendeePhone: null,
      assignedToId: 7,
      notes: null,
      internalNotes: null,
      customFields: { channel: 'partner' },
    });
  });

  it.each([
    ['calendar_not_found', 'NOT_FOUND', undefined],
    ['invalid_contact', 'BAD_USER_INPUT', 'INVALID_CONTACT'],
    ['invalid_assignee', 'BAD_USER_INPUT', 'INVALID_ASSIGNEE'],
    ['slot_unavailable', 'CONFLICT', 'SLOT_UNAVAILABLE'],
  ] as const)(
    'maps create outcome %s without returning persistence details',
    async (kind, code, reason) => {
      repository.create.mockResolvedValue({ kind } as never);
      await expect(
        service.create(3, {
          calendarId: 4,
          startTime: new Date('2026-08-01T17:00:00.000Z'),
          endTime: new Date('2026-08-01T17:30:00.000Z'),
        }),
      ).rejects.toMatchObject({
        extensions: expect.objectContaining({
          code,
          ...(reason ? { reason } : {}),
        }),
      });
    },
  );

  it('rejects invalid create input before opening a transaction', async () => {
    await expect(
      service.create(3, {
        calendarId: 4,
        startTime: new Date('2026-08-01T17:30:00.000Z'),
        endTime: new Date('2026-08-01T17:00:00.000Z'),
        attendeeEmail: 'not-an-email',
      }),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'attendeeEmail',
      }),
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('cancels an active booking and normalizes its reason', async () => {
    repository.cancel.mockResolvedValue({
      kind: 'cancelled',
      row: row({
        status: BookingStatus.CANCELLED,
        cancellation_reason: 'Admin request',
      }),
    });
    await expect(
      service.cancel(3, 9, '  Admin request  '),
    ).resolves.toMatchObject({
      id: 9,
      status: BookingStatus.CANCELLED,
      cancellationReason: 'Admin request',
    });
    expect(repository.cancel).toHaveBeenCalledWith(3, 9, 'Admin request');
  });

  it('rejects repeated or terminal cancellation without another write', async () => {
    repository.cancel.mockResolvedValue({
      kind: 'invalid_status',
    });
    await expect(service.cancel(3, 9)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_BOOKING_STATUS',
      }),
    });
  });

  it('rejects an oversized cancellation reason before the transaction', async () => {
    await expect(service.cancel(3, 9, 'x'.repeat(2001))).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'reason',
        reason: 'TOO_LONG',
      }),
    });
    expect(repository.cancel).not.toHaveBeenCalled();
  });

  it('reschedules an active booking and preserves omitted timezone', async () => {
    repository.reschedule.mockResolvedValue({
      kind: 'rescheduled',
      row: row({
        start_time: new Date('2026-08-02T17:00:00.000Z'),
        end_time: new Date('2026-08-02T17:30:00.000Z'),
      }),
    });
    const startTime = new Date('2026-08-02T17:00:00.000Z');
    const endTime = new Date('2026-08-02T17:30:00.000Z');
    await expect(
      service.reschedule(3, 9, { startTime, endTime }),
    ).resolves.toMatchObject({ id: 9, startTime, endTime });
    expect(repository.reschedule).toHaveBeenCalledWith(
      3,
      9,
      startTime,
      endTime,
      null,
    );
  });

  it.each([
    ['not_found', 'NOT_FOUND', undefined],
    ['invalid_status', 'BAD_USER_INPUT', 'INVALID_BOOKING_STATUS'],
    ['slot_unavailable', 'CONFLICT', 'SLOT_UNAVAILABLE'],
  ] as const)(
    'maps reschedule outcome %s',
    async (kind, code, reason) => {
      repository.reschedule.mockResolvedValue({ kind } as never);
      await expect(
        service.reschedule(3, 9, {
          startTime: new Date('2026-08-02T17:00:00.000Z'),
          endTime: new Date('2026-08-02T17:30:00.000Z'),
        }),
      ).rejects.toMatchObject({
        extensions: expect.objectContaining({
          code,
          ...(reason ? { reason } : {}),
        }),
      });
    },
  );
});
