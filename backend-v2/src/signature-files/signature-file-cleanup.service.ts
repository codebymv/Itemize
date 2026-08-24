/**
 * Faithful port of the legacy signature file cleanup worker
 * (backend/src/services/signature-file-cleanup.service.js +
 * backend/src/jobs/signature-worker-scheduler.js). Claim SQL,
 * referenced-file deferral, retry/dead-letter fencing, redaction, and
 * the server-owned-storage guard (non-retryable for foreign locators,
 * retryable while S3 is unavailable) must stay identical while both
 * runtimes can drain signature_file_deletion_jobs.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export const SIGNATURE_CLEANUP_STORAGE = Symbol('SIGNATURE_CLEANUP_STORAGE');

export interface SignatureCleanupStorage {
  getLocalFilePath(fileUrl: string): string | null;
  getS3KeyFromUrl(fileUrl: string): string | null;
  s3IsConfigured(): boolean;
  s3DeleteFile(key: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export const redactedCleanupError = (error: unknown): string =>
  String(
    (error as { message?: unknown })?.message ||
      error ||
      'Signature file cleanup failed',
  )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:sk|Bearer)\S+\b/gi, '[redacted-secret]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);

/**
 * Default storage boundary mirroring backend/src/services/signature/
 * storage.js path/key validation, backed by the same env-driven S3
 * client shape as the signature file storage provider.
 */
@Injectable()
export class DefaultSignatureCleanupStorage implements SignatureCleanupStorage {
  getLocalFilePath(fileUrl: string): string | null {
    if (!fileUrl || !fileUrl.startsWith('/uploads/signatures/')) return null;
    const signaturesRoot = resolve(process.cwd(), 'uploads/signatures');
    const resolved = resolve(
      signaturesRoot,
      fileUrl.slice('/uploads/signatures/'.length),
    );
    if (!resolved.startsWith(`${signaturesRoot}${sep}`)) return null;
    return resolved;
  }

  getS3KeyFromUrl(fileUrl: string): string | null {
    if (!fileUrl) return null;
    try {
      const url = new URL(fileUrl);
      const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
      const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hostnamePattern = new RegExp(
        `^${escapedBucket}\\.s3(?:\\.[a-z0-9-]+)?\\.amazonaws\\.com$`,
        'i',
      );
      if (!hostnamePattern.test(url.hostname)) return null;
      const key = url.pathname.replace(/^\//, '');
      return key.startsWith('signatures/') ? key : null;
    } catch {
      return null;
    }
  }

  s3IsConfigured(): boolean {
    return Boolean(
      process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_S3_BUCKET,
    );
  }

  async s3DeleteFile(key: string): Promise<void> {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
      }),
    );
  }

  unlink(path: string): Promise<void> {
    return unlink(path);
  }
}

export type SignatureFileCleanupRun = {
  claimed: number;
  deleted: number;
  deferred: number;
  retry: number;
  deadLetter: number;
};

type CleanupClaim = {
  id: number | string;
  attempt_count: number;
  file_url: string;
};

const integer = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
};

@Injectable()
export class SignatureFileCleanupService {
  private readonly logger = new Logger(SignatureFileCleanupService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Optional()
    @Inject(SIGNATURE_CLEANUP_STORAGE)
    private readonly storage: SignatureCleanupStorage = new DefaultSignatureCleanupStorage(),
  ) {}

  async run(
    options: {
      limit?: unknown;
      leaseSeconds?: unknown;
      maxAttempts?: unknown;
      jobId?: number | null;
    } = {},
  ): Promise<SignatureFileCleanupRun> {
    const limit = integer(options.limit, 25, 1, 100);
    const leaseSeconds = integer(options.leaseSeconds, 300, 1, 3600);
    const maxAttempts = integer(options.maxAttempts, 5, 1, 20);
    const summary: SignatureFileCleanupRun = {
      claimed: 0,
      deleted: 0,
      deferred: 0,
      retry: 0,
      deadLetter: 0,
    };
    for (let index = 0; index < limit; index += 1) {
      const claim = await this.claim(leaseSeconds, options.jobId || null);
      if (!claim) break;
      summary.claimed += 1;
      try {
        if (await this.isReferenced(claim.file_url)) {
          await this.defer(claim);
          summary.deferred += 1;
        } else {
          await this.removeOwnedFile(claim.file_url);
          await this.complete(claim);
          summary.deleted += 1;
        }
      } catch (error) {
        const retryable =
          (error as { retryable?: boolean })?.retryable !== false;
        const outcome = await this.fail(claim, error, retryable, maxAttempts);
        if (outcome === 'retry') summary.retry += 1;
        else summary.deadLetter += 1;
      }
      if (options.jobId) break;
    }
    return summary;
  }

  private async claim(
    leaseSeconds: number,
    jobId: number | null,
  ): Promise<CleanupClaim | null> {
    const result = await this.pool.query<CleanupClaim>(
      `WITH candidate AS (
         SELECT id FROM signature_file_deletion_jobs
         WHERE ($2::bigint IS NULL OR id=$2)
           AND ((status IN ('queued','retry') AND next_attempt_at<=CURRENT_TIMESTAMP)
             OR (status='processing' AND lease_expires_at<=CURRENT_TIMESTAMP))
         ORDER BY next_attempt_at,id
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE signature_file_deletion_jobs job
       SET status='processing',attempt_count=attempt_count+1,
         lease_expires_at=CURRENT_TIMESTAMP+($1::int*INTERVAL '1 second'),
         claimed_by=$3,last_error=NULL,updated_at=CURRENT_TIMESTAMP
       FROM candidate WHERE job.id=candidate.id RETURNING job.*`,
      [leaseSeconds, jobId, `backend-v2:${process.pid}`],
    );
    return result.rows[0] || null;
  }

  private async isReferenced(fileUrl: string): Promise<boolean> {
    const result = await this.pool.query<{ referenced: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM signature_documents WHERE file_url=$1
         UNION ALL
         SELECT 1 FROM signature_documents WHERE signed_file_url=$1
         UNION ALL
         SELECT 1 FROM signature_templates WHERE file_url=$1
         UNION ALL
         SELECT 1 FROM signature_document_versions WHERE file_url=$1
       ) AS referenced`,
      [fileUrl],
    );
    return result.rows[0]?.referenced === true;
  }

  private async removeOwnedFile(fileUrl: string): Promise<void> {
    if (fileUrl.startsWith('/uploads/signatures/')) {
      const path = this.storage.getLocalFilePath(fileUrl);
      if (!path) {
        throw Object.assign(
          new Error('File locator is not server-owned storage'),
          { retryable: false },
        );
      }
      try {
        await this.storage.unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      }
      return;
    }
    const key = this.storage.getS3KeyFromUrl(fileUrl);
    if (!key) {
      throw Object.assign(
        new Error('File locator is not server-owned storage'),
        { retryable: false },
      );
    }
    if (!this.storage.s3IsConfigured()) {
      throw new Error('Signature S3 cleanup is unavailable');
    }
    await this.storage.s3DeleteFile(key);
  }

  private complete(claim: CleanupClaim): Promise<void> {
    return this.updateClaim(
      claim,
      `status='deleted',deleted_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,
       claimed_by=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP`,
      [],
    );
  }

  private defer(claim: CleanupClaim): Promise<void> {
    return this.updateClaim(
      claim,
      `status='queued',next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '1 day',
       lease_expires_at=NULL,claimed_by=NULL,last_error='File remains referenced',
       updated_at=CURRENT_TIMESTAMP`,
      [],
    );
  }

  private async fail(
    claim: CleanupClaim,
    error: unknown,
    retryable: boolean,
    maxAttempts: number,
  ): Promise<'retry' | 'dead_letter'> {
    const status =
      !retryable || Number(claim.attempt_count) >= maxAttempts
        ? 'dead_letter'
        : 'retry';
    // $3 is cast in both uses: PostgreSQL deduces conflicting parameter
    // types when one parameter is assigned to a varchar column and
    // compared to a text literal. The uncast legacy statement threw on
    // every failure marking, leaving claims stuck in 'processing' until
    // lease expiry; both runtimes now carry the cast.
    await this.updateClaim(
      claim,
      `status=$3::varchar,next_attempt_at=CASE WHEN $3::varchar='retry'
         THEN CURRENT_TIMESTAMP+(LEAST(3600,POWER(2,GREATEST(attempt_count-1)))*
           INTERVAL '1 minute') ELSE next_attempt_at END,
       lease_expires_at=NULL,claimed_by=NULL,last_error=$4,updated_at=CURRENT_TIMESTAMP`,
      [status, redactedCleanupError(error)],
    );
    return status === 'retry' ? 'retry' : 'dead_letter';
  }

  private async updateClaim(
    claim: CleanupClaim,
    assignments: string,
    additional: unknown[],
  ): Promise<void> {
    const parameters = [claim.id, claim.attempt_count, ...additional];
    const result = await this.pool.query(
      `UPDATE signature_file_deletion_jobs SET ${assignments}
       WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING id`,
      parameters,
    );
    if (!result.rows[0]) {
      throw new Error('Signature file cleanup claim is stale');
    }
  }
}
