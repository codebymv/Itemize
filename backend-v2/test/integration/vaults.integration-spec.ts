import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

const TEST_KEY = '12'.repeat(32);

const encrypt = (plaintext: string) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(TEST_KEY, 'hex'),
    iv,
    { authTagLength: 16 },
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
};

describe('Vault GraphQL PostgreSQL lifecycle', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let vaultId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for vault tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.VAULT_ENCRYPTION_KEY = TEST_KEY;
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Vault Member', 'email', true),
              ($2, 'Vault Outsider', 'email', true)
       RETURNING id`,
      [
        `vault-member-${suffix}@test.itemize`,
        `vault-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    const passwordHash = await bcrypt.hash('password1', 4);
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO vaults (
         user_id, title, category, color_value, position_x, position_y,
         is_locked, encryption_salt, master_password_hash
       ) VALUES
         ($1, 'Credentials', 'Work', '#123456', 10, 20, true, 'salt', $2),
         ($3, 'Foreign', 'Work', '#654321', 0, 0, false, NULL, NULL)
       RETURNING id`,
      [memberId, passwordHash, outsiderId],
    );
    vaultId = Number(inserted.rows[0].id);
    const secret = encrypt('secret-value');
    await pool.query(
      `INSERT INTO vault_items (
         vault_id, item_type, label, encrypted_value, iv, order_index
       ) VALUES ($1, 'key_value', 'API token', $2, $3, 0)`,
      [vaultId, secret.encrypted, secret.iv],
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
  });

  afterAll(async () => {
    if (pool && memberId && outsiderId) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId],
      ]);
    }
    if (app) await app.close();
  });

  const query = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({ query: document, variables });

  const mutation = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'vault-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .send({ query: document, variables });
  };

  const fields = `
    id userId title category colorValue positionX positionY width height zIndex
    isLocked encryptionSalt itemCount requiresUnlock
    items { id vaultId itemType label value orderIndex }
  `;

  it('lists only owned vaults and returns locked metadata without secrets', async () => {
    const result = await query(
      memberToken,
      `query {
        workspaceVaults(filter: { category: "Work", search: "Cred" }) {
          nodes { ${fields} }
          pageInfo { total }
        }
        workspaceVault(id: ${vaultId}) { ${fields} }
      }`,
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.workspaceVaults).toMatchObject({
      pageInfo: { total: 1 },
      nodes: [{ id: vaultId, userId: memberId, itemCount: 1 }],
    });
    expect(result.body.data.workspaceVault).toMatchObject({
      id: vaultId,
      requiresUnlock: true,
      items: [],
    });

    const concealed = await query(
      outsiderToken,
      `query { workspaceVault(id: ${vaultId}) { id } }`,
    ).expect(200);
    expect(concealed.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('verifies the password from GraphQL variables and decrypts compatible storage', async () => {
    const result = await query(
      memberToken,
      `query Vault($id: Int!, $password: String) {
        workspaceVault(id: $id, masterPassword: $password) { ${fields} }
      }`,
      { id: vaultId, password: 'password1' },
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.workspaceVault).toMatchObject({
      requiresUnlock: false,
      items: [{ label: 'API token', value: 'secret-value' }],
    });

    const rejected = await query(
      memberToken,
      `query Vault($id: Int!, $password: String) {
        workspaceVault(id: $id, masterPassword: $password) { id }
      }`,
      { id: vaultId, password: 'password2' },
    ).expect(200);
    expect(rejected.body.errors[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      reason: 'INVALID_MASTER_PASSWORD',
    });
  });

  it('creates, updates, and deletes with CSRF and exact ownership', async () => {
    const noCsrf = await query(
      memberToken,
      `mutation {
        createWorkspaceVault(input: { positionX: 1, positionY: 2 }) { id }
      }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const created = await mutation(
      memberToken,
      `mutation Create($input: CreateWorkspaceVaultInput!) {
        createWorkspaceVault(input: $input) { ${fields} }
      }`,
      {
        input: {
          title: 'New vault',
          category: 'General',
          colorValue: '#ABCDEF',
          positionX: 30,
          positionY: 40,
          masterPassword: 'password3',
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    const createdId = Number(created.body.data.createWorkspaceVault.id);
    expect(created.body.data.createWorkspaceVault).toMatchObject({
      userId: memberId,
      title: 'New vault',
      isLocked: true,
    });

    const updated = await mutation(
      memberToken,
      `mutation Update($id: Int!, $input: UpdateWorkspaceVaultInput!) {
        updateWorkspaceVault(id: $id, input: $input) { id title positionX positionY }
      }`,
      {
        id: createdId,
        input: { title: 'Moved vault', positionX: 50, positionY: 60 },
      },
    ).expect(200);
    expect(updated.body.data.updateWorkspaceVault).toEqual({
      id: createdId,
      title: 'Moved vault',
      positionX: 50,
      positionY: 60,
    });

    const foreignDelete = await mutation(
      outsiderToken,
      `mutation { deleteWorkspaceVault(id: ${createdId}) { deletedId } }`,
    ).expect(200);
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const removed = await mutation(
      memberToken,
      `mutation { deleteWorkspaceVault(id: ${createdId}) { deletedId } }`,
    ).expect(200);
    expect(removed.body.data.deleteWorkspaceVault.deletedId).toBe(createdId);
  });
});
