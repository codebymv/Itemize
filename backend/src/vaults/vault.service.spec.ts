import bcrypt from 'bcryptjs';
import { VaultUnlockRateLimitService } from './vault-unlock-rate-limit.service';
import { VaultRepository } from './vault.repository';
import { VaultService } from './vault.service';

const row = {
  id: 12,
  user_id: 7,
  title: 'Credentials',
  category: 'Work',
  color_value: '#3B82F6',
  position_x: 10,
  position_y: 20,
  width: 400,
  height: 300,
  z_index: 2,
  is_locked: false,
  encryption_salt: null,
  master_password_hash: null,
  crypto_version: 1,
  kdf_algorithm: null,
  kdf_memory_kib: null,
  kdf_iterations: null,
  kdf_parallelism: null,
  wrapped_vek: null,
  wrapped_vek_recovery: null,
  share_token: null,
  share_token_hash: null,
  share_snapshot_ciphertext: null,
  share_snapshot_iv: null,
  is_public: false,
  shared_at: null,
  created_at: new Date('2026-07-23T01:00:00.000Z'),
  updated_at: new Date('2026-07-23T02:00:00.000Z'),
  item_count: 0,
};

describe('VaultService', () => {
  let repository: jest.Mocked<VaultRepository>;
  let service: VaultService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addItem: jest.fn(),
      addItems: jest.fn(),
      updateItem: jest.fn(),
      deleteItem: jest.fn(),
      reorderItems: jest.fn(),
      setPassword: jest.fn(),
      removePassword: jest.fn(),
      enableSharing: jest.fn(),
      disableSharing: jest.fn(),
      enrollV2: jest.fn(),
      rewrapV2: jest.fn(),
    } as unknown as jest.Mocked<VaultRepository>;
    service = new VaultService(repository, new VaultUnlockRateLimitService());
    repository.find.mockResolvedValue({ vault: row, items: [] });
  });

  it('maps a user-scoped paginated list without exposing password material', async () => {
    repository.list.mockResolvedValue({ rows: [row], total: 1 });
    await expect(
      service.list(7, { search: ' Cred ' }, { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({
      nodes: [
        {
          id: 12,
          userId: 7,
          positionX: 10,
          itemCount: 0,
          items: [],
        },
      ],
      pageInfo: { total: 1, totalPages: 1 },
    });
    expect(repository.list).toHaveBeenCalledWith(7, undefined, 'Cred', 1, 50);
  });

  it('returns locked metadata without reading plaintext when no password is supplied', async () => {
    repository.find.mockResolvedValue({
      vault: {
        ...row,
        is_locked: true,
        encryption_salt: 'salt',
        master_password_hash: await bcrypt.hash('password1', 4),
        item_count: 1,
      },
      items: [
        {
          id: 1,
          vault_id: 12,
          item_type: 'key_value',
          label: 'Token',
          encrypted_value: 'ciphertext',
          iv: 'iv',
          crypto_version: 1,
          order_index: 0,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      ],
    });
    await expect(service.get(7, 12)).resolves.toMatchObject({
      id: 12,
      requiresUnlock: true,
      items: [],
      encryptionSalt: 'salt',
    });
  });

  it('rejects an incorrect vault password with a stable reason', async () => {
    repository.find.mockResolvedValue({
      vault: {
        ...row,
        is_locked: true,
        master_password_hash: await bcrypt.hash('password1', 4),
      },
      items: [],
    });
    await expect(service.get(7, 12, 'password2')).rejects.toMatchObject({
      extensions: {
        code: 'UNAUTHENTICATED',
        reason: 'INVALID_MASTER_PASSWORD',
      },
    });
  });

  it('fails closed when a locked vault has no password hash', async () => {
    repository.find.mockResolvedValue({
      vault: { ...row, is_locked: true, master_password_hash: null },
      items: [],
    });
    await expect(service.get(7, 12)).rejects.toMatchObject({
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        reason: 'INVALID_VAULT_LOCK_STATE',
      },
    });
  });

  it('validates and hashes a new locked vault', async () => {
    repository.create.mockImplementation(async (_userId, value) => ({
      ...row,
      title: value.title,
      is_locked: value.isLocked,
      encryption_salt: value.encryptionSalt,
      master_password_hash: value.masterPasswordHash,
    }));
    await expect(
      service.create(7, {
        title: '  Credentials  ',
        positionX: 10,
        positionY: 20,
        masterPassword: 'password1',
      }),
    ).resolves.toMatchObject({
      title: 'Credentials',
      isLocked: true,
      requiresUnlock: false,
    });
    const stored = repository.create.mock.calls[0][1];
    expect(stored.masterPasswordHash).not.toBe('password1');
    await expect(
      bcrypt.compare('password1', stored.masterPasswordHash as string),
    ).resolves.toBe(true);
  });

  it('applies partial position updates and enforces user ownership in the repository call', async () => {
    repository.update.mockResolvedValue({ ...row, position_x: 30, position_y: 40 });
    await expect(
      service.update(7, 12, { positionX: 30, positionY: 40 }),
    ).resolves.toMatchObject({ id: 12, positionX: 30, positionY: 40 });
    expect(repository.update).toHaveBeenCalledWith(7, 12, {
      positionX: 30,
      positionY: 40,
    });
  });

  it('fails closed when deletion does not find an owned vault', async () => {
    repository.delete.mockResolvedValue(false);
    await expect(service.delete(7, 12)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });

  it('hashes a new password and preserves the locked transition result', async () => {
    repository.setPassword.mockImplementation(
      async (
        _userId,
        _vaultId,
        passwordHash,
        encryptionSalt,
      ) => ({
        ...row,
        is_locked: true,
        encryption_salt: encryptionSalt,
        master_password_hash: passwordHash,
      }),
    );
    await expect(
      service.setPassword(7, 12, 'password2'),
    ).resolves.toMatchObject({
      vaultId: 12,
      isLocked: true,
      encryptionSalt: expect.any(String),
    });
    const [, , passwordHash, salt] = repository.setPassword.mock.calls[0];
    expect(passwordHash).not.toBe('password2');
    await expect(bcrypt.compare('password2', passwordHash)).resolves.toBe(true);
    expect(salt).toEqual(expect.any(String));
  });

  it('returns stable password transition errors without exposing hashes', async () => {
    repository.setPassword.mockResolvedValue('current-password-required');
    await expect(
      service.setPassword(7, 12, 'password2'),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'CURRENT_PASSWORD_REQUIRED',
      },
    });
    repository.removePassword.mockResolvedValue('invalid-password');
    await expect(
      service.removePassword(7, 12, 'wrong'),
    ).rejects.toMatchObject({
      extensions: {
        code: 'UNAUTHENTICATED',
        reason: 'INVALID_MASTER_PASSWORD',
      },
    });
    repository.removePassword.mockResolvedValue('vault-not-locked');
    await expect(
      service.removePassword(7, 12, 'password2'),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'VAULT_NOT_LOCKED',
      },
    });
  });

  it('issues stable vault share links, refuses locked vaults, and revokes idempotently', async () => {
    const originalFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.test.itemize/';
    repository.enableSharing.mockResolvedValue({
      ...row,
      share_token: '00000000-0000-4000-8000-000000000001',
      is_public: true,
      shared_at: row.updated_at,
    });
    await expect(service.enableSharing(7, 12, true)).resolves.toEqual({
      vaultId: 12,
      shareToken: '00000000-0000-4000-8000-000000000001',
      shareUrl:
        'https://app.test.itemize/shared/vault/00000000-0000-4000-8000-000000000001',
      isPublic: true,
      sharedAt: row.updated_at,
    });

    repository.enableSharing.mockResolvedValue('vault-locked');
    await expect(service.enableSharing(7, 12, true)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'VAULT_LOCKED' },
    });

    await expect(service.enableSharing(7, 12, false)).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'DECRYPTED_SHARING_CONFIRMATION_REQUIRED',
      },
    });

    repository.disableSharing.mockResolvedValue(row);
    await expect(service.disableSharing(7, 12)).resolves.toMatchObject({
      vaultId: 12,
      shareToken: null,
      shareUrl: null,
      isPublic: false,
      sharedAt: null,
    });
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('encrypts item creates and returns only plaintext projection', async () => {
    process.env.VAULT_ENCRYPTION_KEY = '34'.repeat(32);
    repository.find.mockResolvedValue({ vault: row, items: [] });
    repository.addItem.mockImplementation(async (_userId, vaultId, value) => ({
      id: 2,
      vault_id: vaultId,
      item_type: value.itemType,
      label: value.label,
      encrypted_value: value.encryptedValue,
      iv: value.iv,
      crypto_version: 1,
      order_index: 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    await expect(
      service.addItem(7, 12, {
        itemType: 'key_value',
        label: ' Token ',
        value: 'secret',
      }),
    ).resolves.toMatchObject({
      vaultId: 12,
      label: 'Token',
      value: 'secret',
    });
    const stored = repository.addItem.mock.calls[0][2];
    expect(stored.encryptedValue).not.toContain('secret');
  });

  it('stores opaque client blobs on a v2 vault and returns no plaintext', async () => {
    repository.find.mockResolvedValue({
      vault: {
        ...row,
        crypto_version: 2,
        is_locked: true,
        wrapped_vek: 'wrap.iv',
        encryption_salt: 'salt',
        kdf_algorithm: 'argon2id',
        kdf_memory_kib: 32,
        kdf_iterations: 1,
        kdf_parallelism: 1,
      },
      items: [],
    });
    repository.addItem.mockImplementation(async (_userId, vaultId, value) => ({
      id: 3,
      vault_id: vaultId,
      item_type: value.itemType,
      label: value.label,
      encrypted_value: value.encryptedValue,
      iv: value.iv,
      crypto_version: 2,
      order_index: 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    await expect(
      service.addItem(7, 12, {
        itemType: 'key_value',
        ciphertext: 'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
        iv: 'MTIzNDU2Nzg5MDEy',
      }),
    ).resolves.toMatchObject({
      value: '',
      label: '',
      ciphertext: 'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
      cryptoVersion: 2,
    });
    expect(repository.addItem.mock.calls[0][2].encryptedValue).toBe(
      'Y2lwaGVydGV4dGZvcnZhdWx0aXRlbQ',
    );
  });

  it('rejects locked-vault writes without the master password', async () => {
    repository.find.mockResolvedValue({
      vault: {
        ...row,
        is_locked: true,
        master_password_hash: await bcrypt.hash('password1', 4),
      },
      items: [],
    });
    await expect(
      service.addItem(7, 12, {
        itemType: 'key_value',
        label: 'Token',
        value: 'secret',
      }),
    ).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED', reason: 'VAULT_LOCKED' },
    });
    expect(repository.addItem).not.toHaveBeenCalled();
  });

  it('requires reorder to provide the exact item set', async () => {
    repository.find.mockResolvedValue({ vault: row, items: [] });
    repository.reorderItems.mockResolvedValue('item-set-mismatch');
    await expect(service.reorderItems(7, 12, [2, 3])).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'ITEM_SET_MISMATCH',
      },
    });
  });
});
