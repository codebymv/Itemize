import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type InvoiceLogoStorageResult =
  | { kind: 'deleted' }
  | { kind: 'rejected'; message: string };

export const INVOICE_LOGO_STORAGE = Symbol('INVOICE_LOGO_STORAGE');

export interface InvoiceLogoStorage {
  store(input: {
    buffer: Buffer;
    mimetype: string;
    extension: string;
    organizationId: number;
    scope: 'business' | 'settings';
    resourceId: number | null;
  }): Promise<string>;
  remove(logoUrl: string): Promise<InvoiceLogoStorageResult>;
}

@Injectable()
export class LegacyInvoiceLogoStorage implements InvoiceLogoStorage {
  async store(input: {
    buffer: Buffer;
    mimetype: string;
    extension: string;
    organizationId: number;
    scope: 'business' | 'settings';
    resourceId: number | null;
  }): Promise<string> {
    const identity = input.scope === 'business'
      ? `business-${input.resourceId}` : 'settings';
    const filename = `logo-${input.organizationId}-${identity}-${randomUUID()}${input.extension}`;
    const service = this.s3Service();
    if (service?.isConfigured && service.uploadFile) {
      return service.uploadFile(input.buffer, `logos/${filename}`, input.mimetype);
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Shared invoice logo storage is unavailable');
    }
    const directory = this.localDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, filename), input.buffer, { flag: 'wx' });
    return `/uploads/logos/${filename}`;
  }

  async remove(logoUrl: string): Promise<InvoiceLogoStorageResult> {
    const local = /^\/uploads\/logos\/([A-Za-z0-9._-]+)$/.exec(logoUrl);
    if (local) {
      if (local[1] === '.' || local[1] === '..') {
        return { kind: 'rejected', message: 'Logo URL is not server-owned storage' };
      }
      const candidates = this.localDirectories().map((directory) =>
        resolve(directory, local[1]));
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
    isConfigured?: boolean;
    uploadFile?(buffer: Buffer, key: string, contentType: string): Promise<string>;
    deleteFile(key: string): Promise<void>;
  } | null {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return null;
    const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
    const region = process.env.AWS_REGION || 'us-west-2';
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    const client = this.createS3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
    return {
      bucket,
      region,
      isConfigured: true,
      uploadFile: async (buffer, key, contentType) => {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ServerSideEncryption: 'AES256',
          }),
        );
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      },
      deleteFile: async (key) => {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      },
    };
  }

  protected createS3Client(input: {
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  }): Pick<S3Client, 'send'> {
    return new S3Client(input);
  }

  protected localDirectory(): string {
    return this.localDirectories().find(existsSync) ?? this.localDirectories()[0];
  }

  private localDirectories(): string[] {
    return [
      resolve(process.cwd(), 'uploads/logos'),
      resolve(process.cwd(), 'backend/uploads/logos'),
      resolve(__dirname, '../../uploads/logos'),
    ];
  }
}
