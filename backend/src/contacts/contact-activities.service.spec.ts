import { GraphQLError } from 'graphql';
import {
  ContactActivitiesRepository,
  ContactActivityRow,
} from './contact-activities.repository';
import { ContactActivitiesService } from './contact-activities.service';
import { ContactActivityType } from './contact.enums';

const row = (overrides: Partial<ContactActivityRow> = {}): ContactActivityRow => ({
  id: 91,
  contact_id: 11,
  user_id: 7,
  user_name: 'Owner',
  user_email: 'owner@example.com',
  type: ContactActivityType.NOTE,
  title: 'Follow up',
  content: { body: 'Call tomorrow' },
  metadata: {},
  created_at: new Date('2026-07-17T00:00:00.000Z'),
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

describe('ContactActivitiesService', () => {
  const repository = {
    create: jest.fn(),
    findPage: jest.fn(),
  } as unknown as jest.Mocked<ContactActivitiesRepository>;
  const service = new ContactActivitiesService(repository);

  beforeEach(() => jest.resetAllMocks());

  it('returns a typed, bounded activity page', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 3 });

    const result = await service.list(
      42,
      11,
      { type: ContactActivityType.NOTE },
      { page: 2, pageSize: 2 },
    );

    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 42,
      contactId: 11,
      type: ContactActivityType.NOTE,
      pageSize: 2,
      offset: 2,
    });
    expect(result.nodes[0]).toMatchObject({
      id: 91,
      contactId: 11,
      userId: 7,
      type: ContactActivityType.NOTE,
      content: { body: 'Call tomorrow' },
    });
    expect(result.pageInfo).toMatchObject({ page: 2, total: 3, totalPages: 2 });
  });

  it('fails privately for absent contacts and rejects invalid bounds', async () => {
    repository.findPage.mockResolvedValue(null);
    expect(await codeFrom(service.list(42, 999))).toBe('NOT_FOUND');
    expect(await codeFrom(service.list(42, 0))).toBe('BAD_USER_INPUT');
    expect(await codeFrom(service.list(42, 11, {}, { page: 1, pageSize: 101 })))
      .toBe('BAD_USER_INPUT');
  });

  it('normalizes and creates structured activity content', async () => {
    repository.create.mockResolvedValue(row({ title: 'Follow up' }));

    await expect(service.create(42, 7, 11, {
      type: ContactActivityType.NOTE,
      title: '  Follow up  ',
      content: { body: 'Call tomorrow' },
    })).resolves.toMatchObject({ id: 91, title: 'Follow up' });

    expect(repository.create).toHaveBeenCalledWith(42, 11, 7, {
      type: ContactActivityType.NOTE,
      title: 'Follow up',
      content: { body: 'Call tomorrow' },
      metadata: {},
    });
  });

  it('rejects non-object JSON and redacts database failures', async () => {
    expect(await codeFrom(service.create(42, 7, 11, {
      type: ContactActivityType.NOTE,
      content: [] as never,
    }))).toBe('BAD_USER_INPUT');

    repository.findPage.mockRejectedValue(new Error('secret SQL'));
    try {
      await service.list(42, 11);
      throw new Error('Expected service failure');
    } catch (error) {
      expect((error as GraphQLError).message).toBe(
        'Contact activity service is unavailable',
      );
      expect((error as GraphQLError).extensions.code).toBe('SERVICE_UNAVAILABLE');
    }
  });
});
