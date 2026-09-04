import { CategoriesRepository, CategoryRow } from './categories.repository';
import { CategoriesService } from './categories.service';

const row = (values: Partial<CategoryRow> = {}): CategoryRow => ({
  id: 2,
  user_id: 7,
  name: 'Projects',
  color_value: '#3B82F6',
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:00:00.000Z'),
  ...values,
});

describe('CategoriesService', () => {
  let repository: jest.Mocked<CategoriesRepository>;
  let service: CategoriesService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepository>;
    service = new CategoriesService(repository);
  });

  it('maps rows and normalizes create input', async () => {
    repository.findAll.mockResolvedValue([row()]);
    await expect(service.list(7)).resolves.toEqual([
      {
        id: 2,
        name: 'Projects',
        colorValue: '#3B82F6',
        createdAt: new Date('2026-07-18T12:00:00.000Z'),
        updatedAt: new Date('2026-07-18T12:00:00.000Z'),
      },
    ]);

    repository.create.mockResolvedValue({
      kind: 'created',
      row: row({ name: 'Ideas', color_value: '#ABC' }),
      replayed: false,
    });
    await service.create(
      7,
      { name: ' Ideas ', colorValue: ' #abc ' },
      'category-create-key',
    );
    expect(repository.create).toHaveBeenCalledWith(
      7,
      { name: 'Ideas', colorValue: '#ABC' },
      'category-create-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('supports partial updates but rejects null and empty updates', async () => {
    repository.update.mockResolvedValue({
      kind: 'updated',
      row: row({ color_value: '#ABC' }),
    });
    await service.update(7, 2, { colorValue: '#abc' });
    expect(repository.update).toHaveBeenCalledWith(7, 2, {
      colorValue: '#ABC',
    });

    await expect(service.update(7, 2, {})).rejects.toMatchObject({
      extensions: { reason: 'EMPTY_CATEGORY_UPDATE' },
    });
    await expect(
      service.update(7, 2, { name: null }),
    ).rejects.toMatchObject({
      extensions: { reason: 'NULL_CATEGORY_FIELD' },
    });
  });

  it('maps ownership and General invariant outcomes to stable errors', async () => {
    repository.update.mockResolvedValue({ kind: 'not_found' });
    await expect(
      service.update(7, 999, { name: 'Missing' }),
    ).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });

    repository.update.mockResolvedValue({ kind: 'protected_general' });
    await expect(
      service.update(7, 1, { name: 'Renamed' }),
    ).rejects.toMatchObject({
      extensions: { reason: 'GENERAL_CATEGORY_REQUIRED' },
    });

    repository.delete.mockResolvedValue({ kind: 'general_missing' });
    await expect(service.delete(7, 2)).rejects.toMatchObject({
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'GENERAL_CATEGORY_MISSING',
      },
    });
  });

  it('rejects malformed IDs, names, colors, and duplicate names', async () => {
    await expect(service.delete(7, 0)).rejects.toMatchObject({
      extensions: { reason: 'INVALID_CATEGORY_ID' },
    });
    await expect(
      service.create(7, { name: ' '.repeat(2) }, 'invalid-name-key'),
    ).rejects.toMatchObject({
      extensions: { reason: 'INVALID_CATEGORY_NAME' },
    });
    await expect(
      service.create(7, { name: 'Ideas', colorValue: 'red' }, 'invalid-color-key'),
    ).rejects.toMatchObject({
      extensions: { reason: 'INVALID_CATEGORY_COLOR' },
    });

    repository.create.mockRejectedValue({ code: '23505' });
    await expect(
      service.create(7, { name: 'Ideas' }, 'duplicate-key'),
    ).rejects.toMatchObject({
      extensions: { reason: 'DUPLICATE_CATEGORY_NAME' },
    });
  });

  it('maps replay-key conflicts and unavailable results to stable errors', async () => {
    repository.create.mockResolvedValueOnce({ kind: 'idempotency_conflict' });
    await expect(
      service.create(7, { name: 'Ideas' }, 'reused-key'),
    ).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });

    repository.create.mockResolvedValueOnce({ kind: 'result_unavailable' });
    await expect(
      service.create(7, { name: 'Ideas' }, 'deleted-result-key'),
    ).rejects.toMatchObject({
      extensions: {
        code: 'CONFLICT',
        reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE',
      },
    });
  });
});
