import { AccountDataExportRepository } from './account-data-export.repository';
import { AccountDataExportService } from './account-data-export.service';

describe('AccountDataExportService', () => {
  it('wraps the repository snapshot in a stable versioned envelope', async () => {
    const repository = {
      exportForUser: jest.fn().mockResolvedValue({
        account: { id: 7, email: 'member@example.com' },
        memberships: [],
        personalContent: {},
      }),
    };
    const service = new AccountDataExportService(
      repository as unknown as AccountDataExportRepository,
    );

    await expect(service.exportForUser(7)).resolves.toMatchObject({
      schemaVersion: 1,
      filename: expect.stringMatching(/^itemize-account-export-\d{4}-\d{2}-\d{2}\.json$/),
      generatedAt: expect.any(Date),
      data: { account: { id: 7, email: 'member@example.com' } },
    });
    expect(repository.exportForUser).toHaveBeenCalledWith(7);
  });

  it('conceals a missing account behind the normal not-found contract', async () => {
    const repository = { exportForUser: jest.fn().mockResolvedValue(null) };
    const service = new AccountDataExportService(
      repository as unknown as AccountDataExportRepository,
    );

    await expect(service.exportForUser(99)).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });
});
