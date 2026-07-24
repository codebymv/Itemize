import bcrypt from 'bcryptjs';
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
  share_token: null,
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
    } as unknown as jest.Mocked<VaultRepository>;
    service = new VaultService(repository);
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

  it('encrypts item creates and returns only plaintext projection', async () => {
    process.env.VAULT_ENCRYPTION_KEY = '34'.repeat(32);
    repository.addItem.mockImplementation(async (_userId, vaultId, value) => ({
      id: 2,
      vault_id: vaultId,
      item_type: value.itemType,
      label: value.label,
      encrypted_value: value.encryptedValue,
      iv: value.iv,
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

  it('requires reorder to provide the exact item set', async () => {
    repository.reorderItems.mockResolvedValue('item-set-mismatch');
    await expect(service.reorderItems(7, 12, [2, 3])).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'ITEM_SET_MISMATCH',
      },
    });
  });
});
