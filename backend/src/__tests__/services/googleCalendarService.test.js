const mockEvents = {
  insert: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn(() => ({ events: mockEvents })),
  },
}));

const {
  deterministicGoogleEventId,
  listEvents,
  syncBookingsToGoogle,
} = require('../../services/googleCalendarService');

describe('Google calendar delivery replay contract', () => {
  const connection = {
    id: 9,
    organization_id: 17,
    access_token: 'in-memory-access',
    refresh_token: 'in-memory-refresh',
    selected_calendars: ['primary'],
  };
  const booking = {
    id: 41,
    organization_id: 17,
    title: 'Replay-safe booking',
    attendee_name: 'Attendee',
    attendee_email: 'attendee@example.com',
    start_time: '2027-03-02T10:00:00.000Z',
    end_time: '2027-03-02T11:00:00.000Z',
    timezone: 'UTC',
    status: 'confirmed',
  };

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses a deterministic provider ID and repairs an ambiguous create replay', async () => {
    const providerId = deterministicGoogleEventId(connection.id, booking.id);
    mockEvents.insert.mockRejectedValue({ code: 409, message: 'already exists' });
    mockEvents.patch.mockResolvedValue({ data: { id: providerId } });
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };

    const result = await syncBookingsToGoogle(pool, connection, [booking]);

    expect(result).toMatchObject({ created: 1, updated: 0, deleted: 0, failed: 0 });
    expect(mockEvents.insert).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'primary',
      resource: expect.objectContaining({ id: providerId }),
    }));
    expect(mockEvents.patch).toHaveBeenCalledWith(expect.objectContaining({
      eventId: providerId,
    }));
    expect(pool.query.mock.calls[1][1]).toEqual([
      connection.id,
      booking.id,
      providerId,
      'primary',
    ]);
  });

  test('treats an already-missing cancelled event as a completed deletion', async () => {
    mockEvents.delete.mockRejectedValue({ response: { status: 404 } });
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 55,
            external_event_id: 'remote-event',
            external_calendar_id: 'primary',
          }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };

    const result = await syncBookingsToGoogle(pool, connection, [{
      ...booking,
      status: 'cancelled',
    }]);

    expect(result).toMatchObject({ created: 0, updated: 0, deleted: 1, failed: 0 });
    expect(mockEvents.delete).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'remote-event',
    }));
    expect(pool.query.mock.calls[1][0]).toContain('DELETE FROM calendar_sync_events');
  });

  test('paginates events and resolves all-day dates in the provider timezone', async () => {
    mockEvents.list
      .mockResolvedValueOnce({
        data: {
          timeZone: 'America/Phoenix',
          items: [{
            id: 'all-day',
            start: { date: '2027-03-02' },
            end: { date: '2027-03-03' },
            status: 'confirmed',
          }],
          nextPageToken: 'next-page',
        },
      })
      .mockResolvedValueOnce({
        data: {
          timeZone: 'America/Phoenix',
          items: [{
            id: 'timed',
            start: { dateTime: '2027-03-04T10:00:00.000Z' },
            end: { dateTime: '2027-03-04T11:00:00.000Z' },
          }],
        },
      });

    const result = await listEvents(
      connection,
      'primary',
      new Date('2027-03-01T00:00:00.000Z'),
      new Date('2027-04-01T00:00:00.000Z')
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'all-day',
      start: '2027-03-02T07:00:00.000Z',
      end: '2027-03-03T07:00:00.000Z',
      timezone: 'America/Phoenix',
    });
    expect(mockEvents.list.mock.calls[1][0]).toMatchObject({
      pageToken: 'next-page',
      maxResults: 250,
    });
  });
});
