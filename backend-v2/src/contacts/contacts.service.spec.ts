import { GraphQLError } from 'graphql';
import { ContactSortField, ContactStatus, SortDirection } from './contact.enums';
import { ContactRow, ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';

const row = (overrides: Partial<ContactRow> = {}): ContactRow => ({
  id: 11,
  organization_id: 42,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  company: 'Analytical Engines',
  job_title: null,
  address: {},
  source: 'manual',
  status: 'active',
  custom_fields: {},
  tags: ['vip'],
  assigned_to: null,
  assigned_to_name: null,
  assigned_to_email: null,
  created_by: 7,
  created_by_name: 'Owner',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const codeFrom = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return String((error as GraphQLError).extensions.code);
  }
};

describe('ContactsService', () => {
  const repository = {
    create: jest.fn(),
    delete: jest.fn(),
    findPage: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<ContactsRepository>;
  const service = new ContactsService(repository);

  beforeEach(() => jest.resetAllMocks());

  it('normalizes filters and produces the shared page contract', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 3 });
    const result = await service.list(
      42,
      {
        search: '  Ada  ',
        status: ContactStatus.ACTIVE,
        tags: [' vip ', 'vip'],
        assignedToId: 7,
      },
      { page: 2, pageSize: 2 },
      { field: ContactSortField.FIRST_NAME, direction: SortDirection.ASC },
    );

    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 42,
      search: 'Ada',
      status: ContactStatus.ACTIVE,
      tags: ['vip'],
      assignedToId: 7,
      sortField: ContactSortField.FIRST_NAME,
      sortDirection: SortDirection.ASC,
      pageSize: 2,
      offset: 2,
    });
    expect(result.pageInfo).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(result.nodes[0]).toMatchObject({
      id: 11,
      organizationId: 42,
      firstName: 'Ada',
      tags: ['vip'],
    });
  });

  it.each([
    [{ page: 0, pageSize: 50 }, 'BAD_USER_INPUT'],
    [{ page: 1, pageSize: 101 }, 'BAD_USER_INPUT'],
  ])('rejects invalid page input before querying', async (page, code) => {
    expect(await codeFrom(service.list(42, {}, page))).toBe(code);
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('rejects invalid filters before querying', async () => {
    expect(
      await codeFrom(service.list(42, { assignedToId: -1 })),
    ).toBe('BAD_USER_INPUT');
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('returns an organization-owned contact', async () => {
    repository.findById.mockResolvedValue(row());
    await expect(service.get(42, 11)).resolves.toMatchObject({
      id: 11,
      organizationId: 42,
    });
    expect(repository.findById).toHaveBeenCalledWith(42, 11);
  });

  it('maps an absent or foreign contact to NOT_FOUND', async () => {
    repository.findById.mockResolvedValue(null);
    expect(await codeFrom(service.get(42, 999))).toBe('NOT_FOUND');
  });

  it('maps database errors without exposing their messages', async () => {
    repository.findPage.mockRejectedValue(new Error('secret SQL text'));
    try {
      await service.list(42);
      throw new Error('Expected failure');
    } catch (error) {
      expect((error as GraphQLError).message).toBe(
        'Contact service is unavailable',
      );
      expect((error as GraphQLError).extensions.code).toBe(
        'SERVICE_UNAVAILABLE',
      );
    }
  });

  it('normalizes create input and maps the created contact', async () => {
    repository.create.mockResolvedValue({ kind: 'created', row: row() });
    await expect(service.create(42, 7, {
      firstName: '  Ada  ',
      email: 'ADA@EXAMPLE.COM',
      tags: [' vip ', 'vip'],
    })).resolves.toMatchObject({ id: 11, firstName: 'Ada' });
    expect(repository.create).toHaveBeenCalledWith(42, 7, expect.objectContaining({
      firstName: 'Ada',
      email: 'ada@example.com',
      source: 'manual',
      status: 'active',
      tags: ['vip'],
    }));
  });

  it('rejects create without identity and invalid assignment outcomes', async () => {
    expect(await codeFrom(service.create(42, 7, { phone: '+1 555 123 4567' })))
      .toBe('BAD_USER_INPUT');
    expect(repository.create).not.toHaveBeenCalled();

    repository.create.mockResolvedValue({ kind: 'invalid_assignee' });
    expect(await codeFrom(service.create(42, 7, { firstName: 'Ada', assignedToId: 99 })))
      .toBe('BAD_USER_INPUT');
  });

  it('preserves omitted update fields and turns explicit empty strings into null', async () => {
    repository.update.mockResolvedValue({
      kind: 'updated',
      row: row({ company: null }),
      changedFields: ['company'],
    });
    await service.update(42, 7, 11, { company: '' });
    expect(repository.update).toHaveBeenCalledWith(42, 7, 11, { company: null });
  });

  it('maps private update/delete misses to NOT_FOUND', async () => {
    repository.update.mockResolvedValue({ kind: 'not_found' });
    repository.delete.mockResolvedValue(false);
    expect(await codeFrom(service.update(42, 7, 999, { company: 'Nope' })))
      .toBe('NOT_FOUND');
    expect(await codeFrom(service.delete(42, 999))).toBe('NOT_FOUND');
  });
});
