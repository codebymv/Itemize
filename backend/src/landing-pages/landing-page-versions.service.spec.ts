import { LandingPageVersionsRepository } from './landing-page-versions.repository';
import { LandingPageVersionsService } from './landing-page-versions.service';

const versionRow = {
  id: 31,
  page_id: 12,
  version_number: 3,
  content: { name: 'Launch', slug: 'launch', sections: [] },
  description: 'Snapshot',
  created_by: 7,
  created_by_name: 'Owner',
  published_at: null,
  is_current: false,
  created_at: new Date('2026-07-23T10:00:00.000Z'),
};

describe('LandingPageVersionsService', () => {
  let repository: jest.Mocked<LandingPageVersionsRepository>;
  let service: LandingPageVersionsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      publish: jest.fn(),
      delete: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<LandingPageVersionsRepository>;
    service = new LandingPageVersionsService(repository);
  });

  it('maps list metadata and normalizes create descriptions', async () => {
    repository.list.mockResolvedValue({
      versions: [versionRow],
      currentVersionId: 31,
    });
    await expect(service.list(4, 12)).resolves.toMatchObject({
      currentVersionId: 31,
      versions: [
        {
          id: 31,
          pageId: 12,
          versionNumber: 3,
          createdByName: 'Owner',
        },
      ],
    });

    repository.create.mockResolvedValue(versionRow);
    await service.create(4, 12, 7, '  Snapshot  ');
    expect(repository.create).toHaveBeenCalledWith(4, 12, 7, 'Snapshot');
  });

  it('redacts stored password hashes from version content', async () => {
    repository.find.mockResolvedValue({
      ...versionRow,
      content: {
        name: 'Launch',
        slug: 'launch',
        settings: {
          enableAnalytics: true,
          password: '$2b$10$not-a-real-test-hash',
        },
        sections: [],
      },
    });
    await expect(service.get(4, 12, 31)).resolves.toMatchObject({
      content: {
        settings: { enableAnalytics: true },
        password_protected: true,
      },
    });
    const result = await service.get(4, 12, 31);
    expect(
      (result.content.settings as Record<string, unknown>).password,
    ).toBeUndefined();
  });

  it('rejects invalid identifiers and unbounded descriptions before querying', async () => {
    await expect(service.get(4, 0, 31)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'pageId',
      }),
    });
    await expect(
      service.create(4, 12, 7, 'x'.repeat(1001)),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'description',
      }),
    });
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('exposes stable errors for invalid snapshots and current-version deletion', async () => {
    repository.publish.mockResolvedValue({ status: 'invalid_snapshot' });
    await expect(service.publish(4, 12, 31)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'CONFLICT',
        reason: 'INVALID_VERSION_SNAPSHOT',
      }),
    });

    repository.delete.mockResolvedValue('current');
    await expect(service.delete(4, 12, 31)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        reason: 'CURRENT_VERSION',
      }),
    });
  });

  it('maps publish slug conflicts without masking other failures', async () => {
    repository.publish.mockRejectedValueOnce({ code: '23505' });
    await expect(service.publish(4, 12, 31)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'CONFLICT',
        reason: 'VERSION_SLUG_CONFLICT',
      }),
    });
  });
});
