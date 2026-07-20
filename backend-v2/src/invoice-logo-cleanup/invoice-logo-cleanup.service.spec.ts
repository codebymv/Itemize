import { InvoiceLogoCleanupRepository } from './invoice-logo-cleanup.repository';
import { InvoiceLogoCleanupService } from './invoice-logo-cleanup.service';
import { InvoiceLogoStorage } from './invoice-logo-storage.provider';

describe('InvoiceLogoCleanupService', () => {
  const jobs = {
    dueIds: jest.fn(), claim: jest.fn(), isReferenced: jest.fn(),
    complete: jest.fn(), fail: jest.fn(),
  } as unknown as jest.Mocked<InvoiceLogoCleanupRepository>;
  const storage = { remove: jest.fn() } as jest.Mocked<InvoiceLogoStorage>;
  const service = new InvoiceLogoCleanupService(jobs, storage);
  const job = {
    id: 9, organization_id: 4, scope: 'settings' as const, resource_id: null,
    logo_url: '/uploads/logos/logo-4.png', status: 'processing',
    attempt_count: 1, next_attempt_at: new Date(), lease_expires_at: new Date(),
    claimed_by: 'test', last_error: null, deleted_at: null,
    created_at: new Date(), updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jobs.dueIds.mockResolvedValue([{ id: 9, organizationId: 4 }]);
    jobs.claim.mockResolvedValue(job);
    jobs.isReferenced.mockResolvedValue(false);
    jobs.complete.mockResolvedValue({ ...job, status: 'deleted' });
    jobs.fail.mockResolvedValue({ ...job, status: 'retry' });
  });

  it('completes only confirmed storage deletion', async () => {
    storage.remove.mockResolvedValue({ kind: 'deleted' });
    await expect(service.runDue()).resolves.toEqual({ attempted: 1, deleted: 1 });
    expect(jobs.complete).toHaveBeenCalledWith(4, 9);
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('dead-letters rejected ownership and retries provider failures', async () => {
    storage.remove.mockResolvedValueOnce({
      kind: 'rejected', message: 'not server owned',
    });
    await service.runDue();
    expect(jobs.fail).toHaveBeenLastCalledWith(4, 9, 'not server owned', false);

    storage.remove.mockRejectedValueOnce(new Error('S3 unavailable'));
    await service.runDue();
    expect(jobs.fail).toHaveBeenLastCalledWith(4, 9, 'S3 unavailable', true);
  });

  it('completes without storage access while another row references the URL', async () => {
    jobs.isReferenced.mockResolvedValue(true);
    await expect(service.runDue()).resolves.toEqual({ attempted: 1, deleted: 0 });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(jobs.complete).toHaveBeenCalledWith(4, 9);
  });
});
