import { GraphQLError } from 'graphql';
import { ContactContentRepository } from './contact-content.repository';
import { ContactContentService } from './contact-content.service';

const codeFrom = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return String((error as GraphQLError).extensions.code);
  }
};

describe('ContactContentService', () => {
  const repository = {
    find: jest.fn(),
  } as unknown as jest.Mocked<ContactContentRepository>;
  const service = new ContactContentService(repository);

  beforeEach(() => jest.resetAllMocks());

  it('maps bounded deterministic collections and exposes truncation', async () => {
    repository.find.mockResolvedValue({
      lists: [{
        id: 3,
        title: 'Priority',
        category: null,
        created_at: new Date('2026-01-03T00:00:00.000Z'),
        total: 101,
      }],
      notes: [],
      whiteboards: [],
    });

    await expect(service.get(42, 11)).resolves.toEqual({
      lists: {
        nodes: [{
          id: 3,
          title: 'Priority',
          category: null,
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
        }],
        total: 101,
        hasMore: true,
      },
      notes: { nodes: [], total: 0, hasMore: false },
      whiteboards: { nodes: [], total: 0, hasMore: false },
    });
    expect(repository.find).toHaveBeenCalledWith(42, 11, 100);
  });

  it('rejects invalid and foreign contact IDs without leaking tenancy', async () => {
    expect(await codeFrom(service.get(42, 0))).toBe('BAD_USER_INPUT');
    expect(repository.find).not.toHaveBeenCalled();

    repository.find.mockResolvedValue(null);
    expect(await codeFrom(service.get(42, 99))).toBe('NOT_FOUND');
  });

  it('maps unexpected repository failures to a stable error', async () => {
    repository.find.mockRejectedValue(new Error('secret SQL'));
    expect(await codeFrom(service.get(42, 11))).toBe('SERVICE_UNAVAILABLE');
  });
});
