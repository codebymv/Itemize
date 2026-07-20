import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export type InvoiceLogoStorageResult =
  | { kind: 'deleted' }
  | { kind: 'rejected'; message: string };

export const INVOICE_LOGO_STORAGE = Symbol('INVOICE_LOGO_STORAGE');

export interface InvoiceLogoStorage {
  remove(logoUrl: string): Promise<InvoiceLogoStorageResult>;
}

@Injectable()
export class LegacyInvoiceLogoStorage implements InvoiceLogoStorage {
  async remove(logoUrl: string): Promise<InvoiceLogoStorageResult> {
    const local = /^\/uploads\/logos\/([A-Za-z0-9._-]+)$/.exec(logoUrl);
    if (local) {
      if (local[1] === '.' || local[1] === '..') {
        return { kind: 'rejected', message: 'Logo URL is not server-owned storage' };
      }
      const candidates = [
        resolve(process.cwd(), 'backend/uploads/logos', local[1]),
        resolve(process.cwd(), '../backend/uploads/logos', local[1]),
        resolve(process.cwd(), '../../backend/uploads/logos', local[1]),
      ];
      const existing = candidates.find(existsSync);
      if (existing) await unlink(existing);
      return { kind: 'deleted' };
    }

    let parsed: URL;
    try {
      parsed = new URL(logoUrl);
    } catch {
      return { kind: 'rejected', message: 'Logo URL is not server-owned storage' };
    }
    const service = this.s3Service();
    if (!service) {
      return { kind: 'rejected', message: 'S3 logo cleanup is unavailable' };
    }
    const expectedHost = `${service.bucket}.s3.${service.region}.amazonaws.com`;
    let key: string;
    try {
      key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    } catch {
      return { kind: 'rejected', message: 'Logo URL is not server-owned storage' };
    }
    if (
      parsed.protocol !== 'https:' || parsed.hostname !== expectedHost ||
      parsed.search || parsed.hash || !/^logos\/[A-Za-z0-9._/-]+$/.test(key) ||
      key.split('/').some((part) => part === '..')
    ) {
      return { kind: 'rejected', message: 'Logo URL is not server-owned storage' };
    }
    await service.deleteFile(key);
    return { kind: 'deleted' };
  }

  protected s3Service(): {
    bucket: string;
    region: string;
    deleteFile(key: string): Promise<void>;
  } | null {
    const candidates = [
      resolve(process.cwd(), 'backend/src/services/s3.service.js'),
      resolve(process.cwd(), '../backend/src/services/s3.service.js'),
      resolve(__dirname, '../../../backend/src/services/s3.service.js'),
    ];
    const path = candidates.find(existsSync);
    if (!path) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path);
  }
}
