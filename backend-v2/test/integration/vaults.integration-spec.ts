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

  it('refuses to create a dormant share capability while the vault is locked', async () => {
    const result = await mutation(
      memberToken,
      `mutation {
        enableWorkspaceVaultSharing(
          vaultId: ${vaultId}
          confirmDecryptedSharing: true
        ) {
          vaultId shareToken isPublic
        }
      }`,
    ).expect(200);
    expect(result.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'VAULT_LOCKED',
    });
    const stored = await pool.query(
      'SELECT share_token, is_public, shared_at FROM vaults WHERE id = $1',
      [vaultId],
    );
    expect(stored.rows[0]).toMatchObject({
      share_token: null,
      is_public: false,
      shared_at: null,
    });
  });

  it('atomically adds, bulk imports, updates, exact-set reorders, and deletes items', async () => {
    const denied = await mutation(
      memberToken,
      `mutation Add($vaultId: Int!, $input: CreateWorkspaceVaultItemInput!) {
        addWorkspaceVaultItem(vaultId: $vaultId, input: $input) {
          id
        }
      }`,
      {
        vaultId,
        input: { itemType: 'secure_note', label: 'Note', value: '' },
      },
    ).expect(200);
    expect(denied.body.errors[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      reason: 'VAULT_LOCKED',
    });

    const added = await mutation(
      memberToken,
      `mutation Add(
        $vaultId: Int!
        $input: CreateWorkspaceVaultItemInput!
        $masterPassword: String
      ) {
        addWorkspaceVaultItem(
          vaultId: $vaultId
          input: $input
          masterPassword: $masterPassword
        ) {
          id vaultId itemType label value orderIndex
        }
      }`,
      {
        vaultId,
        masterPassword: 'password1',
        input: { itemType: 'secure_note', label: ' Note ', value: '' },
      },
    ).expect(200);
    expect(added.body.errors).toBeUndefined();
    const addedId = Number(added.body.data.addWorkspaceVaultItem.id);
    expect(added.body.data.addWorkspaceVaultItem).toMatchObject({
      label: 'Note',
      value: '',
      orderIndex: 1,
    });

    const bulk = await mutation(
      memberToken,
      `mutation Bulk(
        $vaultId: Int!
        $items: [CreateWorkspaceVaultItemInput!]!
        $masterPassword: String
      ) {
        addWorkspaceVaultItems(
          vaultId: $vaultId
          items: $items
          masterPassword: $masterPassword
        ) {
          count
          items { id value orderIndex }
        }
      }`,
      {
        vaultId,
        masterPassword: 'password1',
        items: [
          { itemType: 'key_value', label: 'A', value: 'one' },
          { itemType: 'key_value', label: 'B', value: 'two' },
        ],
      },
    ).expect(200);
    expect(bulk.body.errors).toBeUndefined();
    expect(bulk.body.data.addWorkspaceVaultItems).toMatchObject({
      count: 2,
      items: [
        { value: 'one', orderIndex: 2 },
        { value: 'two', orderIndex: 3 },
      ],
    });
    const bulkIds = bulk.body.data.addWorkspaceVaultItems.items.map(
      (item: { id: number }) => Number(item.id),
    );
    const original = await pool.query<{ id: number }>(
      `SELECT id FROM vault_items
       WHERE vault_id = $1 AND id <> ALL($2::int[])
       ORDER BY order_index LIMIT 1`,
      [vaultId, [addedId, ...bulkIds]],
    );
    const originalId = Number(original.rows[0].id);
    const order = [bulkIds[1], originalId, addedId, bulkIds[0]];

    const reordered = await mutation(
      memberToken,
      `mutation Reorder($vaultId: Int!, $itemIds: [Int!]!, $masterPassword: String) {
        reorderWorkspaceVaultItems(
          vaultId: $vaultId
          itemIds: $itemIds
          masterPassword: $masterPassword
        ) {
          count
          items { id orderIndex value }
        }
      }`,
      { vaultId, itemIds: order, masterPassword: 'password1' },
    ).expect(200);
    expect(reordered.body.data.reorderWorkspaceVaultItems.items.map(
      (item: { id: number }) => Number(item.id),
    )).toEqual(order);

    const mismatch = await mutation(
      memberToken,
      `mutation {
        reorderWorkspaceVaultItems(
          vaultId: ${vaultId}
          itemIds: [${originalId}]
          masterPassword: "password1"
        ) {
          count
        }
      }`,
    ).expect(200);
    expect(mismatch.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'ITEM_SET_MISMATCH',
    });

    const updated = await mutation(
      memberToken,
      `mutation Update($input: UpdateWorkspaceVaultItemInput!) {
        updateWorkspaceVaultItem(
          vaultId: ${vaultId}
          itemId: ${addedId}
          input: $input
          masterPassword: "password1"
        ) { id label value }
      }`,
      { input: { label: 'Updated', value: 'new-secret' } },
    ).expect(200);
    expect(updated.body.data.updateWorkspaceVaultItem).toMatchObject({
      id: addedId,
      label: 'Updated',
      value: 'new-secret',
    });

    const removed = await mutation(
      memberToken,
      `mutation {
        deleteWorkspaceVaultItem(
          vaultId: ${vaultId}
          itemId: ${addedId}
          masterPassword: "password1"
        ) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(removed.body.data.deleteWorkspaceVaultItem.deletedId).toBe(addedId);
  });

  it('rotates and removes the password transactionally with current-password proof', async () => {
    await pool.query(
      `UPDATE vaults
       SET share_token = '00000000-0000-4000-8000-000000000099',
           is_public = TRUE, shared_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [vaultId],
    );
    const setDocument = `mutation SetPassword(
      $vaultId: Int!
      $newPassword: String!
      $currentPassword: String
    ) {
      setWorkspaceVaultPassword(
        vaultId: $vaultId
        newPassword: $newPassword
        currentPassword: $currentPassword
      ) { vaultId isLocked encryptionSalt }
    }`;

    const noCsrf = await query(memberToken, setDocument, {
      vaultId,
      newPassword: 'password2',
      currentPassword: 'password1',
    }).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const missingCurrent = await mutation(memberToken, setDocument, {
      vaultId,
      newPassword: 'password2',
    }).expect(200);
    expect(missingCurrent.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'CURRENT_PASSWORD_REQUIRED',
    });

    const wrongCurrent = await mutation(memberToken, setDocument, {
      vaultId,
      newPassword: 'password2',
      currentPassword: 'wrong',
    }).expect(200);
    expect(wrongCurrent.body.errors[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      reason: 'INVALID_MASTER_PASSWORD',
    });

    const concealed = await mutation(outsiderToken, setDocument, {
      vaultId,
      newPassword: 'password2',
    }).expect(200);
    expect(concealed.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const changed = await mutation(memberToken, setDocument, {
      vaultId,
      newPassword: 'password2',
      currentPassword: 'password1',
    }).expect(200);
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.setWorkspaceVaultPassword).toMatchObject({
      vaultId,
      isLocked: true,
      encryptionSalt: expect.any(String),
    });
    const revokedByLock = await pool.query(
      'SELECT share_token, is_public, shared_at FROM vaults WHERE id = $1',
      [vaultId],
    );
    expect(revokedByLock.rows[0]).toMatchObject({
      share_token: null,
      is_public: false,
      shared_at: null,
    });

    const oldPassword = await query(
      memberToken,
      `query {
        workspaceVault(id: ${vaultId}, masterPassword: "password1") { id }
      }`,
    ).expect(200);
    expect(oldPassword.body.errors[0].extensions.reason).toBe(
      'INVALID_MASTER_PASSWORD',
    );
    const newPassword = await query(
      memberToken,
      `query {
        workspaceVault(id: ${vaultId}, masterPassword: "password2") {
          items { value }
        }
      }`,
    ).expect(200);
    expect(
      newPassword.body.data.workspaceVault.items.map(
        (item: { value: string }) => item.value,
      ),
    ).toContain('secret-value');

    const removeDocument = `mutation RemovePassword(
      $vaultId: Int!
      $password: String!
    ) {
      removeWorkspaceVaultPassword(vaultId: $vaultId, password: $password) {
        vaultId isLocked encryptionSalt
      }
    }`;
    const rejected = await mutation(memberToken, removeDocument, {
      vaultId,
      password: 'password1',
    }).expect(200);
    expect(rejected.body.errors[0].extensions.reason).toBe(
      'INVALID_MASTER_PASSWORD',
    );

    const removed = await mutation(memberToken, removeDocument, {
      vaultId,
      password: 'password2',
    }).expect(200);
    expect(removed.body.errors).toBeUndefined();
    expect(removed.body.data.removeWorkspaceVaultPassword).toEqual({
      vaultId,
      isLocked: false,
      encryptionSalt: null,
    });

    const nowOpen = await query(
      memberToken,
      `query { workspaceVault(id: ${vaultId}) { items { value } } }`,
    ).expect(200);
    expect(
      nowOpen.body.data.workspaceVault.items.map(
        (item: { value: string }) => item.value,
      ),
    ).toContain('secret-value');

    const alreadyOpen = await mutation(memberToken, removeDocument, {
      vaultId,
      password: 'password2',
    }).expect(200);
    expect(alreadyOpen.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'VAULT_NOT_LOCKED',
    });
  });

  it('serializes issuance, conceals ownership, revokes, and rotates capabilities', async () => {
    const enableDocument = `mutation Enable(
      $vaultId: Int!
      $confirmDecryptedSharing: Boolean!
    ) {
      enableWorkspaceVaultSharing(
        vaultId: $vaultId
        confirmDecryptedSharing: $confirmDecryptedSharing
      ) {
        vaultId shareToken shareUrl isPublic sharedAt
      }
    }`;
    const missingConsent = await mutation(memberToken, enableDocument, {
      vaultId,
      confirmDecryptedSharing: false,
    }).expect(200);
    expect(missingConsent.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'DECRYPTED_SHARING_CONFIRMATION_REQUIRED',
    });
    const [first, second] = await Promise.all([
      mutation(memberToken, enableDocument, {
        vaultId,
        confirmDecryptedSharing: true,
      }),
      mutation(memberToken, enableDocument, {
        vaultId,
        confirmDecryptedSharing: true,
      }),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.enableWorkspaceVaultSharing).toMatchObject({
      vaultId,
      isPublic: true,
      shareToken: expect.any(String),
      shareUrl: expect.stringContaining('/shared/vault/'),
      sharedAt: expect.any(String),
    });
    const oldToken =
      first.body.data.enableWorkspaceVaultSharing.shareToken as string;
    expect(second.body.data.enableWorkspaceVaultSharing.shareToken).toBe(
      oldToken,
    );
    expect(second.body.data.enableWorkspaceVaultSharing.sharedAt).toBe(
      first.body.data.enableWorkspaceVaultSharing.sharedAt,
    );

    const concealed = await mutation(outsiderToken, enableDocument, {
      vaultId,
      confirmDecryptedSharing: true,
    }).expect(200);
    expect(concealed.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const disableDocument = `mutation Disable($vaultId: Int!) {
      disableWorkspaceVaultSharing(vaultId: $vaultId) {
        vaultId shareToken shareUrl isPublic sharedAt
      }
    }`;
    const disabled = await mutation(memberToken, disableDocument, {
      vaultId,
    }).expect(200);
    expect(disabled.body.errors).toBeUndefined();
    expect(disabled.body.data.disableWorkspaceVaultSharing).toEqual({
      vaultId,
      shareToken: null,
      shareUrl: null,
      isPublic: false,
      sharedAt: null,
    });
    const disabledAgain = await mutation(memberToken, disableDocument, {
      vaultId,
    }).expect(200);
    expect(disabledAgain.body.errors).toBeUndefined();

    const reshared = await mutation(memberToken, enableDocument, {
      vaultId,
      confirmDecryptedSharing: true,
    }).expect(200);
    expect(
      reshared.body.data.enableWorkspaceVaultSharing.shareToken,
    ).not.toBe(oldToken);
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

  it('stores v2 blobs without decrypting them on the server', async () => {
    const created = await mutation(
      memberToken,
      `mutation Create($input: CreateWorkspaceVaultInput!) {
        createWorkspaceVault(input: $input) {
          id cryptoVersion wrappedVek isLocked
        }
      }`,
      {
        input: {
          title: 'ZKE vault',
          positionX: 1,
          positionY: 2,
          cryptoVersion: 2,
          kdfSalt: 'c2FsdHNhbHRzYWx0c2FsdA==',
          kdfMemoryKiB: 32,
          kdfIterations: 1,
          kdfParallelism: 1,
          wrappedVek: 'dGVzdGl2dGVzdGl2.dGVzdGNpcGhlcnRleHRmb3J0ZXN0',
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    const zkeId = Number(created.body.data.createWorkspaceVault.id);
    expect(created.body.data.createWorkspaceVault).toMatchObject({
      cryptoVersion: 2,
      isLocked: true,
    });

    const added = await mutation(
      memberToken,
      `mutation Add($vaultId: Int!, $input: CreateWorkspaceVaultItemInput!) {
        addWorkspaceVaultItem(vaultId: $vaultId, input: $input) {
          label value ciphertext iv cryptoVersion
        }
      }`,
      {
        vaultId: zkeId,
        input: {
          itemType: 'key_value',
          ciphertext: 'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
          iv: 'MTIzNDU2Nzg5MDEy',
        },
      },
    ).expect(200);
    expect(added.body.errors).toBeUndefined();
    expect(added.body.data.addWorkspaceVaultItem).toMatchObject({
      label: '',
      value: '',
      ciphertext: 'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
      cryptoVersion: 2,
    });

    const detail = await query(
      memberToken,
      `query { workspaceVault(id: ${zkeId}) {
        cryptoVersion items { value ciphertext }
      } }`,
    ).expect(200);
    expect(detail.body.data.workspaceVault.items[0].value).toBe('');
    expect(detail.body.data.workspaceVault.items[0].ciphertext).toBe(
      'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
    );
    await mutation(
      memberToken,
      `mutation { deleteWorkspaceVault(id: ${zkeId}) { deletedId } }`,
    );
  });
});
