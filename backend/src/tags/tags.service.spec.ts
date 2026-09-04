import { TagRow, TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';

const row = (values: Partial<TagRow> = {}): TagRow => ({
  id: 3,
  organization_id: 5,
  name: 'VIP',
  color: '#3B82F6',
  contact_count: 2,
  deal_count: 1,
  created_at: new Date('2026-09-03T12:00:00.000Z'),
  ...values,
});

describe('TagsService', () => {
  let repository: jest.Mocked<TagsRepository>;
  let service: TagsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      suggestions: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TagsRepository>;
    service = new TagsService(repository);
  });

  it('normalizes creation intent before fingerprinting and persistence', async () => {
    repository.create.mockResolvedValue({
      kind: 'created',
      row: row({ name: 'Newsletter', color: '#10B981' }),
      replayed: false,
    });

    await expect(service.create(
      5,
      7,
      { name: ' Newsletter ', color: ' #10b981 ' },
      'tag-create-key',
    )).resolves.toMatchObject({
      id: 3,
      organizationId: 5,
      name: 'Newsletter',
      color: '#10B981',
    });
    expect(repository.create).toHaveBeenCalledWith(
      5,
      7,
      { name: 'Newsletter', color: '#10B981' },
      'tag-create-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('maps replay-key conflicts and unavailable results to stable errors', async () => {
    repository.create.mockResolvedValueOnce({ kind: 'idempotency_conflict' });
    await expect(
      service.create(5, 7, { name: 'VIP' }, 'reused-key'),
    ).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });

    repository.create.mockResolvedValueOnce({ kind: 'result_unavailable' });
    await expect(
      service.create(5, 7, { name: 'VIP' }, 'deleted-result-key'),
    ).rejects.toMatchObject({
      extensions: {
        code: 'CONFLICT',
        reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE',
      },
    });
  });

  it('rejects malformed keys before repository admission', async () => {
    await expect(
      service.create(5, 7, { name: 'VIP' }, 'contains spaces'),
    ).rejects.toMatchObject({
      extensions: { reason: 'INVALID_IDEMPOTENCY_KEY' },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
