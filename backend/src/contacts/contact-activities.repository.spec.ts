import { ContactActivitiesRepository } from './contact-activities.repository';
import { ContactActivityType } from './contact.enums';

describe('ContactActivitiesRepository', () => {
  const query = jest.fn();
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  const repository = new ContactActivitiesRepository({ connect } as never);

  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockClear();
  });

  it('scopes activity pages through the organization-owned contact', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    await repository.findPage({
      organizationId: 42,
      contactId: 11,
      type: ContactActivityType.NOTE,
      pageSize: 25,
      offset: 50,
    });

    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('organization_id = $1 AND id = $2'),
      [42, 11],
    ]);
    expect(query.mock.calls[1][0]).toContain('c.organization_id = $1');
    expect(query.mock.calls[2][0]).toContain(
      'ORDER BY ca.created_at DESC, ca.id DESC',
    );
    expect(query.mock.calls[2][1]).toEqual([
      42,
      11,
      ContactActivityType.NOTE,
      25,
      50,
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not query child rows when the contact is absent or foreign', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(repository.findPage({
      organizationId: 42,
      contactId: 999,
      pageSize: 50,
      offset: 0,
    })).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('locks the owned contact and inserts JSON in one transaction', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 11 }] })
      .mockResolvedValueOnce({ rows: [{ id: 91 }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 91,
          contact_id: 11,
          user_id: 7,
          user_name: 'Owner',
          user_email: 'owner@example.com',
          type: 'note',
          title: 'Follow up',
          content: { body: 'Call tomorrow' },
          metadata: {},
          created_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({});

    await repository.create(42, 11, 7, {
      type: ContactActivityType.NOTE,
      title: 'Follow up',
      content: { body: 'Call tomorrow' },
      metadata: {},
    });

    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1][0]).toContain('FOR KEY SHARE');
    expect(query.mock.calls[1][1]).toEqual([42, 11]);
    expect(query.mock.calls[2][1]).toEqual([
      11,
      7,
      ContactActivityType.NOTE,
      'Follow up',
      JSON.stringify({ body: 'Call tomorrow' }),
      JSON.stringify({}),
    ]);
    expect(query.mock.calls[4][0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
