import { ContactSortField, ContactStatus, SortDirection } from './contact.enums';
import { ContactsRepository } from './contacts.repository';

describe('ContactsRepository', () => {
  const query = jest.fn();
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  const repository = new ContactsRepository({ connect, query } as never);

  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockClear();
  });

  it('parameterizes filters and uses a deterministic sort tie-breaker', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [] });

    await repository.findPage({
      organizationId: 42,
      search: 'Ada',
      status: ContactStatus.ACTIVE,
      tags: ['vip'],
      assignedToId: 7,
      sortField: ContactSortField.CREATED_AT,
      sortDirection: SortDirection.DESC,
      pageSize: 25,
      offset: 50,
    });

    expect(query.mock.calls[0][0]).toContain('c.organization_id = $1');
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY c.created_at DESC, c.id DESC',
    );
    expect(query.mock.calls[1][0]).toContain(
      'om_assigned.organization_id = c.organization_id',
    );
    expect(query.mock.calls[1][1]).toEqual([
      42,
      '%Ada%',
      'active',
      ['vip'],
      7,
      25,
      50,
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the client when a query fails', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(
      repository.findPage({
        organizationId: 42,
        sortField: ContactSortField.CREATED_AT,
        sortDirection: SortDirection.DESC,
        pageSize: 50,
        offset: 0,
      }),
    ).rejects.toThrow('database unavailable');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('scopes detail lookup by both organization and contact ID', async () => {
    query.mockResolvedValue({ rows: [] });
    await repository.findById(42, 11);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE c.organization_id = $1 AND c.id = $2'),
      [42, 11],
    );
    expect(query.mock.calls[0][0]).toContain(
      'om_created.organization_id = c.organization_id',
    );
  });

  it('deletes only through the organization-qualified transaction', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 11 }] })
      .mockResolvedValueOnce({});

    await expect(repository.delete(42, 11)).resolves.toBe(true);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('WHERE organization_id = $1 AND id = $2'),
      [42, 11],
    ]);
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[2][0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
