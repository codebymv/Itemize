import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/database.module';
import {
  SIGNATURE_CLEANUP_STORAGE,
  SignatureFileCleanupService,
} from '../../src/signature-files/signature-file-cleanup.service';

type JobRow = {
  status: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: Date | null;
  deleted_at: Date | null;
};

describe('Signature file cleanup worker parity (NestJS vs legacy)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let nestCleanup: SignatureFileCleanupService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let LegacyCleanupService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;

  const unlinked: string[] = [];
  const s3Deleted: string[] = [];
  let s3Configured = true;
  let s3Failure: Error | null = null;

  const nestStorage = {
    getLocalFilePath: (fileUrl: string) =>
      fileUrl.startsWith('/uploads/signatures/')
        ? `/fake-root/${fileUrl.slice('/uploads/signatures/'.length)}`
        : null,
    getS3KeyFromUrl: (fileUrl: string) => {
      try {
        const url = new URL(fileUrl);
        if (!/\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/i.test(url.hostname)) {
          return null;
        }
        const key = url.pathname.replace(/^\//, '');
        return key.startsWith('signatures/') ? key : null;
      } catch {
        return null;
      }
    },
    s3IsConfigured: () => s3Configured,
    s3DeleteFile: async (key: string) => {
      if (s3Failure) throw s3Failure;
      s3Deleted.push(key);
    },
    unlink: async (path: string) => {
      unlinked.push(path);
    },
  };

  const legacyDependencies = () => ({
    unlink: nestStorage.unlink,
    getLocalFilePath: nestStorage.getLocalFilePath,
    getS3KeyFromUrl: nestStorage.getS3KeyFromUrl,
    s3Service: {
      get isConfigured() {
        return s3Configured;
      },
      deleteFile: nestStorage.s3DeleteFile,
    },
  });

  const seedJob = async (suffix: string, fileUrl: string) => {
    const row = (
      await pool.query<{ id: number }>(
        `INSERT INTO signature_file_deletion_jobs
           (organization_id, file_url, next_attempt_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '1 second')
         RETURNING id`,
        [organizationId, fileUrl],
      )
    ).rows[0];
    return row.id;
  };

  const jobRow = async (id: number): Promise<JobRow> =>
    (
      await pool.query<JobRow>(
        `SELECT status, attempt_count, last_error, next_attempt_at, deleted_at
         FROM signature_file_deletion_jobs WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for cleanup tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    ({ SignatureFileCleanupService: LegacyCleanupService } = require(
      '../../../backend/src/services/signature-file-cleanup.service',
    ));
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `signature-cleanup-${Date.now()}@test.itemize`,
      'Cleanup Owner',
    );
    organizationId = owner.org.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(SIGNATURE_CLEANUP_STORAGE)
      .useValue(nestStorage)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
    nestCleanup = app.get(SignatureFileCleanupService);

    // Neutralize claimable rows other suites may have staged.
    await pool.query(
      `UPDATE signature_file_deletion_jobs SET status = 'deleted'
       WHERE status IN ('queued', 'retry')`,
    );
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  const runners = () => [
    {
      name: 'legacy',
      run: (options: Record<string, unknown> = {}) =>
        new LegacyCleanupService(pool, legacyDependencies()).run(options),
    },
    {
      name: 'nest',
      run: (options: Record<string, unknown> = {}) => nestCleanup.run(options),
    },
  ];

  it('deletes unreferenced local files identically', async () => {
    const outcomes: JobRow[] = [];
    for (const runner of runners()) {
      const jobId = await seedJob(
        `local-${runner.name}`,
        `/uploads/signatures/orphan-${runner.name}-${Date.now()}.pdf`,
      );
      const summary = await runner.run({ jobId });
      expect(summary).toEqual({
        claimed: 1,
        deleted: 1,
        deferred: 0,
        retry: 0,
        deadLetter: 0,
      });
      outcomes.push(await jobRow(jobId));
    }
    const [legacy, nest] = outcomes;
    expect(nest.status).toBe('deleted');
    expect(legacy.status).toBe('deleted');
    expect(nest.deleted_at).not.toBeNull();
    expect(legacy.deleted_at).not.toBeNull();
    expect(unlinked).toHaveLength(2);
  });

  it('defers files that are still referenced identically', async () => {
    const outcomes: JobRow[] = [];
    for (const runner of runners()) {
      const fileUrl = `/uploads/signatures/referenced-${runner.name}-${Date.now()}.pdf`;
      await pool.query(
        `INSERT INTO signature_documents (organization_id, title, file_url, created_by)
         VALUES ($1, 'Still referenced', $2,
                 (SELECT user_id FROM organization_members WHERE organization_id = $1 LIMIT 1))`,
        [organizationId, fileUrl],
      );
      const jobId = await seedJob(`ref-${runner.name}`, fileUrl);
      const summary = await runner.run({ jobId });
      expect(summary).toEqual({
        claimed: 1,
        deleted: 0,
        deferred: 1,
        retry: 0,
        deadLetter: 0,
      });
      outcomes.push(await jobRow(jobId));
    }
    const [legacy, nest] = outcomes;
    expect(nest.status).toBe('queued');
    expect(legacy.status).toBe('queued');
    expect(nest.last_error).toBe('File remains referenced');
    expect(legacy.last_error).toBe('File remains referenced');
    expect(nest.next_attempt_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters foreign locators as non-retryable identically', async () => {
    const outcomes: JobRow[] = [];
    for (const runner of runners()) {
      const jobId = await seedJob(
        `foreign-${runner.name}`,
        `https://attacker.example.com/steal-${runner.name}.pdf`,
      );
      const summary = await runner.run({ jobId });
      expect(summary).toEqual({
        claimed: 1,
        deleted: 0,
        deferred: 0,
        retry: 0,
        deadLetter: 1,
      });
      outcomes.push(await jobRow(jobId));
    }
    const [legacy, nest] = outcomes;
    expect(nest.status).toBe('dead_letter');
    expect(legacy.status).toBe('dead_letter');
    expect(nest.last_error).toBe(legacy.last_error);
    expect(nest.attempt_count).toBe(1);
  });

  it('retries while S3 cleanup is unavailable identically', async () => {
    const outcomes: JobRow[] = [];
    s3Configured = false;
    try {
      for (const runner of runners()) {
        const jobId = await seedJob(
          `s3down-${runner.name}`,
          `https://itemize-uploads.s3.us-east-1.amazonaws.com/signatures/orphan-${runner.name}.pdf`,
        );
        const summary = await runner.run({ jobId });
        expect(summary).toEqual({
          claimed: 1,
          deleted: 0,
          deferred: 0,
          retry: 1,
          deadLetter: 0,
        });
        outcomes.push(await jobRow(jobId));
      }
    } finally {
      s3Configured = true;
    }
    const [legacy, nest] = outcomes;
    expect(nest.status).toBe('retry');
    expect(legacy.status).toBe('retry');
    expect(nest.last_error).toBe(legacy.last_error);
    expect(nest.last_error).toBe('Signature S3 cleanup is unavailable');
  });

  it('deletes unreferenced S3 files identically', async () => {
    for (const runner of runners()) {
      const jobId = await seedJob(
        `s3ok-${runner.name}`,
        `https://itemize-uploads.s3.us-east-1.amazonaws.com/signatures/gone-${runner.name}.pdf`,
      );
      const summary = await runner.run({ jobId });
      expect(summary.deleted).toBe(1);
      expect((await jobRow(jobId)).status).toBe('deleted');
    }
    expect(s3Deleted.filter((key) => key.includes('gone-'))).toHaveLength(2);
  });
});
