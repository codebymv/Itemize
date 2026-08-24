import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceLogoStorage } from '../invoice-logo-cleanup/invoice-logo-storage.provider';
import { InvoiceLogoUploadsRepository } from './invoice-logo-uploads.repository';
import { InvoiceLogoUploadsService } from './invoice-logo-uploads.service';

describe('InvoiceLogoUploadsService', () => {
  const repository = {
    businessExists: jest.fn(), replaceBusiness: jest.fn(), replaceSettings: jest.fn(),
  } as unknown as jest.Mocked<InvoiceLogoUploadsRepository>;
  const storage = { store: jest.fn(), remove: jest.fn() } as jest.Mocked<InvoiceLogoStorage>;
  const service = new InvoiceLogoUploadsService(repository, storage);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from([0, 0, 0, 0]),
  ]);
  const file = { buffer: png, mimetype: 'image/png', size: png.length };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.businessExists.mockResolvedValue(true);
    repository.replaceBusiness.mockResolvedValue(true);
    repository.replaceSettings.mockResolvedValue(undefined);
    storage.store.mockResolvedValue('/uploads/logos/new.png');
    storage.remove.mockResolvedValue({ kind: 'deleted' });
  });

  it('stores verified bytes then commits a tenant-owned business reference', async () => {
    await expect(service.business(4, '7', file)).resolves.toEqual({
      logo_url: '/uploads/logos/new.png',
    });
    expect(storage.store).toHaveBeenCalledWith(expect.objectContaining({
      buffer: png, mimetype: 'image/png', extension: '.png',
      organizationId: 4, scope: 'business', resourceId: 7,
    }));
    expect(repository.replaceBusiness).toHaveBeenCalledWith(4, 7, '/uploads/logos/new.png');
  });

  it('conceals foreign businesses before storage access', async () => {
    repository.businessExists.mockResolvedValue(false);
    await expect(service.business(4, '7', file)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('rejects spoofed or structurally incomplete images before storage', async () => {
    await expect(service.settings(4, {
      buffer: Buffer.from('not an image'), mimetype: 'image/png', size: 12,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('removes newly stored bytes when the database replacement fails', async () => {
    repository.replaceSettings.mockRejectedValue(new Error('database unavailable'));
    await expect(service.settings(4, file)).rejects.toThrow('database unavailable');
    expect(storage.remove).toHaveBeenCalledWith('/uploads/logos/new.png');
  });
});
