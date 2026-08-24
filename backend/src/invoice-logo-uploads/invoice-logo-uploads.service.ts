import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  INVOICE_LOGO_STORAGE, InvoiceLogoStorage,
} from '../invoice-logo-cleanup/invoice-logo-storage.provider';
import { InvoiceLogoUploadsRepository } from './invoice-logo-uploads.repository';

type LogoFile = { buffer: Buffer; mimetype: string; size: number };
type LogoType = { mimetype: string; extension: string };

@Injectable()
export class InvoiceLogoUploadsService {
  private readonly logger = new Logger(InvoiceLogoUploadsService.name);

  constructor(
    private readonly repository: InvoiceLogoUploadsRepository,
    @Inject(INVOICE_LOGO_STORAGE) private readonly storage: InvoiceLogoStorage,
  ) {}

  async business(
    organizationId: number, rawBusinessId: string, file: LogoFile | undefined,
  ): Promise<{ logo_url: string }> {
    const businessId = this.id(rawBusinessId);
    if (!(await this.repository.businessExists(organizationId, businessId))) {
      throw new NotFoundException({ error: 'Business not found', code: 'NOT_FOUND' });
    }
    return this.persist(organizationId, 'business', businessId, file, async (url) => {
      if (!(await this.repository.replaceBusiness(organizationId, businessId, url))) {
        throw new NotFoundException({ error: 'Business not found', code: 'NOT_FOUND' });
      }
    });
  }

  settings(
    organizationId: number, file: LogoFile | undefined,
  ): Promise<{ logo_url: string }> {
    return this.persist(organizationId, 'settings', null, file, (url) =>
      this.repository.replaceSettings(organizationId, url));
  }

  private async persist(
    organizationId: number,
    scope: 'business' | 'settings',
    resourceId: number | null,
    file: LogoFile | undefined,
    commit: (url: string) => Promise<void>,
  ): Promise<{ logo_url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ error: 'No file uploaded', code: 'BAD_REQUEST' });
    }
    const type = this.detect(file.buffer);
    if (!type) {
      throw new BadRequestException({ error: 'Invalid image file content', code: 'BAD_REQUEST' });
    }
    const url = await this.storage.store({
      buffer: file.buffer, mimetype: type.mimetype, extension: type.extension,
      organizationId, scope, resourceId,
    });
    try {
      await commit(url);
      return { logo_url: url };
    } catch (error) {
      try {
        await this.storage.remove(url);
      } catch (cleanupError) {
        this.logger.error('Failed to compensate uncommitted invoice logo upload', {
          organizationId, scope, resourceId,
          error: cleanupError instanceof Error ? cleanupError.message : 'unknown',
        });
      }
      throw error;
    }
  }

  private id(value: string): number {
    if (!/^[1-9]\d{0,9}$/.test(value)) {
      throw new BadRequestException({ error: 'Business ID is invalid', code: 'BAD_REQUEST' });
    }
    const id = Number(value);
    if (id > 2_147_483_647) {
      throw new BadRequestException({ error: 'Business ID is invalid', code: 'BAD_REQUEST' });
    }
    return id;
  }

  private detect(buffer: Buffer): LogoType | null {
    if (buffer.length >= 20 && buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ) && buffer.subarray(-12, -8).equals(Buffer.from([0, 0, 0, 0])) &&
        buffer.subarray(-8, -4).toString('ascii') === 'IEND') {
      return { mimetype: 'image/png', extension: '.png' };
    }
    if (buffer.length >= 5 && buffer[0] === 0xff && buffer[1] === 0xd8 &&
        buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) {
      return { mimetype: 'image/jpeg', extension: '.jpg' };
    }
    const header = buffer.subarray(0, 6).toString('ascii');
    if (buffer.length >= 14 && (header === 'GIF87a' || header === 'GIF89a') &&
        buffer.at(-1) === 0x3b) {
      return { mimetype: 'image/gif', extension: '.gif' };
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP' &&
        buffer.readUInt32LE(4) === buffer.length - 8) {
      return { mimetype: 'image/webp', extension: '.webp' };
    }
    return null;
  }
}
