import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const SIGNATURE_FILE_STORAGE = Symbol('SIGNATURE_FILE_STORAGE');

export type SignatureFileScope = 'document' | 'template';

export interface SignatureFileStorage {
  store(input: {
    buffer: Buffer;
    organizationId: number;
    resourceId: number;
    scope: SignatureFileScope;
  }): Promise<string>;
  read(fileUrl: string): Promise<Buffer | null>;
  remove(fileUrl: string): Promise<void>;
}

type LegacyS3Service = {
  bucket: string;
  region: string;
  isConfigured?: boolean;
  uploadFile?(buffer: Buffer, key: string, contentType: string): Promise<string>;
  getFile?(key: string): Promise<{ Body?: unknown } | undefined>;
  deleteFile?(key: string): Promise<void>;
};

@Injectable()
export class LegacySignatureFileStorage implements SignatureFileStorage {
  private resolvedS3: LegacyS3Service | null | undefined;

  async store(input: {
    buffer: Buffer;
    organizationId: number;
    resourceId: number;
    scope: SignatureFileScope;
  }): Promise<string> {
    const filename =
      `signature-${input.organizationId}-${input.scope}-${input.resourceId}-${randomUUID()}.pdf`;
    const s3 = this.s3Service();
    if (s3?.isConfigured && s3.uploadFile) {
      return s3.uploadFile(
        input.buffer,
        `signatures/${filename}`,
        'application/pdf',
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Shared signature file storage is unavailable');
    }
    const directory = this.localDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, filename), input.buffer, { flag: 'wx' });
    return `/uploads/signatures/${filename}`;
  }

  async read(fileUrl: string): Promise<Buffer | null> {
    const local = this.localFilename(fileUrl);
    if (local) {
      for (const directory of this.localDirectories()) {
        try {
          return await readFile(resolve(directory, local));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return null;
    }
    const s3 = this.s3Service();
    const key = this.s3Key(fileUrl, s3);
    if (!key || !s3?.getFile) return null;
    const response = await s3.getFile(key);
    if (!response?.Body) return null;
    return this.bodyBuffer(response.Body);
  }

  async remove(fileUrl: string): Promise<void> {
    const local = this.localFilename(fileUrl);
    if (local) {
      for (const directory of this.localDirectories()) {
        try {
          await unlink(resolve(directory, local));
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return;
    }
    const s3 = this.s3Service();
    const key = this.s3Key(fileUrl, s3);
    if (!key || !s3?.deleteFile) {
      throw new Error('Signature file locator is not server-owned storage');
    }
    await s3.deleteFile(key);
  }

  protected s3Service(): LegacyS3Service | null {
    if (this.resolvedS3 !== undefined) return this.resolvedS3;
    this.resolvedS3 = this.legacyS3Service() ?? this.nativeS3Service();
    return this.resolvedS3;
  }

  protected legacyS3Service(): LegacyS3Service | null {
    const candidates = [
      resolve(process.cwd(), 'backend/src/services/s3.service.js'),
      resolve(process.cwd(), '../backend/src/services/s3.service.js'),
      resolve(__dirname, '../../../backend/src/services/s3.service.js'),
    ];
    const path = candidates.find(existsSync);
    if (!path) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as LegacyS3Service;
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

  private nativeS3Service(): LegacyS3Service | null {
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
      getFile: async (key) =>
        client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
      deleteFile: async (key) => {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      },
    };
  }

  private localFilename(fileUrl: string): string | null {
    const match = /^\/uploads\/signatures\/([A-Za-z0-9._-]+)$/.exec(fileUrl);
    if (!match || match[1] === '.' || match[1] === '..') return null;
    return match[1];
  }

  private s3Key(
    fileUrl: string,
    service: LegacyS3Service | null,
  ): string | null {
    if (!service) return null;
    let parsed: URL;
    try {
      parsed = new URL(fileUrl);
    } catch {
      return null;
    }
    const expectedHost = `${service.bucket}.s3.${service.region}.amazonaws.com`;
    let key: string;
    try {
      key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    } catch {
      return null;
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== expectedHost ||
      parsed.search ||
      parsed.hash ||
      !/^signatures\/[A-Za-z0-9._/-]+$/.test(key) ||
      key.split('/').some((part) => part === '..')
    ) {
      return null;
    }
    return key;
  }

  private async bodyBuffer(body: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(body)) return body;
    if (
      typeof body === 'object' &&
      body !== null &&
      'transformToByteArray' in body &&
      typeof body.transformToByteArray === 'function'
    ) {
      return Buffer.from(await body.transformToByteArray());
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      Symbol.asyncIterator in body
    ) {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    throw new Error('Signature file storage returned an unsupported body');
  }

  private localDirectory(): string {
    return (
      this.localDirectories().find(existsSync) ?? this.localDirectories()[0]
    );
  }

  private localDirectories(): string[] {
    return [
      resolve(process.cwd(), 'backend/uploads/signatures'),
      resolve(process.cwd(), '../backend/uploads/signatures'),
      resolve(process.cwd(), '../../backend/uploads/signatures'),
    ];
  }
}
