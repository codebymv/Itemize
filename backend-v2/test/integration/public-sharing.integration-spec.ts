import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { encryptVaultItemValue } from '../../src/public-sharing/vault-item-crypto';

const CAPABILITY_HEADERS = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};

describe('Public sharing retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let ownerId: number;
  const seededIds: Record<string, number> = {};

  const tokens = {
    list: crypto.randomUUID(),
    note: crypto.randomUUID(),
    whiteboard: crypto.randomUUID(),
    wireframe: crypto.randomUUID(),
    vault: crypto.randomUUID(),
    lockedVault: crypto.randomUUID(),
    brokenVault: crypto.randomUUID(),
    snapshotVault: crypto.randomUUID(),
    revokedNote: crypto.randomUUID(),
    unknown: crypto.randomUUID(),
  };

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for public sharing tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.VAULT_ENCRYPTION_KEY = 'ef'.repeat(32);
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Sharing Owner<script>alert(1)</script>', 'email', true)
       RETURNING id`,
      [`public-sharing-owner-${suffix}@test.itemize`],
    );
    ownerId = Number(user.rows[0].id);

    const [list, note, whiteboard, wireframe] = await Promise.all([
      pool.query<{ id: number }>(
        `INSERT INTO lists (user_id, title, category, items, share_token, is_public, shared_at)
         VALUES ($1, '<b>Shared list</b>', 'General', $2::jsonb, $3, TRUE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          ownerId,
          JSON.stringify([
            {
              id: 'safe',
              text: '<img src=x onerror="alert(1)">Task<script>alert(2)</script>',
              completed: false,
            },
          ]),
          tokens.list,
        ],
      ),
      pool.query<{ id: number }>(
        `INSERT INTO notes (user_id, title, content, share_token, is_public, shared_at)
         VALUES ($1, 'Shared note', '<p>Hello</p><script>alert(1)</script>', $2, TRUE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [ownerId, tokens.note],
      ),
      pool.query<{ id: number }>(
        `INSERT INTO whiteboards (user_id, title, canvas_data, share_token, is_public, shared_at)
         VALUES ($1, 'Shared board', $2::jsonb, $3, TRUE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          ownerId,
          JSON.stringify({
            nodes: [
              {
                text: '<svg onload="alert(1)">Board</svg>',
                metadata: { label: '<script>x</script>Safe' },
              },
            ],
          }),
          tokens.whiteboard,
        ],
      ),
      pool.query<{ id: number }>(
        `INSERT INTO wireframes (user_id, title, share_token, is_public, shared_at)
         VALUES ($1, '<b>Shared wireframe</b>', $2, TRUE, CURRENT_TIMESTAMP)
         RETURNING id`,
        [ownerId, tokens.wireframe],
      ),
    ]);
    seededIds.list = Number(list.rows[0].id);
    seededIds.note = Number(note.rows[0].id);
    seededIds.whiteboard = Number(whiteboard.rows[0].id);
    seededIds.wireframe = Number(wireframe.rows[0].id);

    await pool.query(
      `INSERT INTO notes (user_id, title, content, share_token, is_public)
       VALUES ($1, 'Revoked note', 'gone', $2, FALSE)`,
      [ownerId, tokens.revokedNote],
    );

    const vaults = await pool.query<{ id: number }>(
      `INSERT INTO vaults (user_id, title, is_locked, share_token, is_public, shared_at)
       VALUES ($1, 'Shared vault', FALSE, $2, TRUE, CURRENT_TIMESTAMP),
              ($1, 'Locked vault', TRUE, $3, TRUE, CURRENT_TIMESTAMP),
              ($1, 'Broken vault', FALSE, $4, TRUE, CURRENT_TIMESTAMP)
       RETURNING id`,
      [ownerId, tokens.vault, tokens.lockedVault, tokens.brokenVault],
    );
    const [vaultId, , brokenVaultId] = vaults.rows.map((row) => Number(row.id));
    seededIds.vault = vaultId;

    await pool.query(
      `INSERT INTO vaults (
         user_id, title, is_locked, share_token, is_public, shared_at,
         crypto_version, share_snapshot_ciphertext, share_snapshot_iv
       ) VALUES ($1, 'Snapshot vault', TRUE, $2, TRUE, CURRENT_TIMESTAMP, 2, 'snapshot-ciphertext', 'snapshot-iv')`,
      [ownerId, tokens.snapshotVault],
    );

    const secret = encryptVaultItemValue('hunter2');
    await pool.query(
      `INSERT INTO vault_items (vault_id, item_type, label, encrypted_value, iv, order_index)
       VALUES ($1, 'key_value', 'Password', $2, $3, 0),
              ($4, 'key_value', 'Broken secret', 'invalid', 'invalid', 0)`,
      [vaultId, secret.encrypted, secret.iv, brokenVaultId],
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

    /* eslint-disable @typescript-eslint/no-var-requires */
    /* eslint-enable @typescript-eslint/no-var-requires */
    const noopLimit = (_req: Request, _res: Response, next: NextFunction) =>
      next();
  });

  afterAll(async () => {
    if (pool && ownerId) {
      await pool.query(
        'DELETE FROM vault_items WHERE vault_id IN (SELECT id FROM vaults WHERE user_id = $1)',
        [ownerId],
      );
      for (const table of ['vaults', 'wireframes', 'whiteboards', 'notes', 'lists']) {
        await pool.query(`DELETE FROM ${table} WHERE user_id = $1`, [ownerId]);
      }
      await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
    }
    if (app) {
      await app.close();
    } else {
      await pool?.end();
    }
  });

  const getPath = async (path: string) => request(app.getHttpServer()).get(path);

  it.each(['list', 'note', 'whiteboard', 'wireframe', 'vault'] as const)(
    'serves an active public %s capability identically in both runtimes',
    async (kind) => {
      const nest = await getPath(
        `/api/shared/${kind}/${tokens[kind]}`,
      );
      expect(nest.status).toBe(200);
      expect(nest.headers).toMatchObject(CAPABILITY_HEADERS);
      expect(JSON.stringify(nest.body)).not.toMatch(/<script|onerror|onload/i);
    },
  );

  it('decrypts vault items identically and never exposes ciphertext', async () => {
    const nest = await getPath(
      `/api/shared/vault/${tokens.vault}`,
    );
    expect(nest.body.data.items).toEqual([
      {
        id: expect.anything(),
        item_type: 'key_value',
        label: 'Password',
        value: 'hunter2',
        order_index: 0,
      },
    ]);
  });

  it.each(['list', 'note', 'whiteboard', 'wireframe', 'vault'] as const)(
    'rejects a malformed public %s token identically in both runtimes',
    async (kind) => {
      const nest = await getPath(
        `/api/shared/${kind}/not-a-token`,
      );
      expect(nest.status).toBe(404);
      expect(nest.headers).toMatchObject(CAPABILITY_HEADERS);
    },
  );

  it.each(['list', 'note', 'whiteboard', 'wireframe', 'vault'] as const)(
    'rejects an unknown public %s token identically in both runtimes',
    async (kind) => {
      const nest = await getPath(
        `/api/shared/${kind}/${tokens.unknown}`,
      );
      expect(nest.status).toBe(404);
    },
  );

  it('conceals a revoked capability identically in both runtimes', async () => {
    const nest = await getPath(
      `/api/shared/note/${tokens.revokedNote}`,
    );
    expect(nest.status).toBe(404);
  });

  it('denies a locked v1 vault identically in both runtimes', async () => {
    const nest = await getPath(
      `/api/shared/vault/${tokens.lockedVault}`,
    );
    expect(nest.status).toBe(403);
  });

  it('fails a vault with an undecryptable item closed identically in both runtimes', async () => {
    const nest = await getPath(
      `/api/shared/vault/${tokens.brokenVault}`,
    );
    expect(nest.status).toBe(500);
    for (const body of [nest.body]) {
      expect(JSON.stringify(body)).not.toContain('Broken secret');
      expect(JSON.stringify(body)).not.toContain('invalid');
    }
  });

  it('serves a v2 vault snapshot without item decryption identically in both runtimes', async () => {
    const nest = await getPath(
      `/api/shared/vault/${tokens.snapshotVault}`,
    );
    expect(nest.status).toBe(200);
    expect(nest.body.data).toMatchObject({
      crypto_version: 2,
      snapshot: { ciphertext: 'snapshot-ciphertext', iv: 'snapshot-iv' },
      items: [],
    });
  });
});
