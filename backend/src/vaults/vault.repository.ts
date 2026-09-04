import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type VaultRow = {
  id: number;
  user_id: number;
  title: string;
  category: string;
  color_value: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  is_locked: boolean;
  encryption_salt: string | null;
  master_password_hash: string | null;
  crypto_version: number;
  kdf_algorithm: string | null;
  kdf_memory_kib: number | null;
  kdf_iterations: number | null;
  kdf_parallelism: number | null;
  wrapped_vek: string | null;
  wrapped_vek_recovery: string | null;
  share_token: string | null;
  share_token_hash: string | null;
  share_snapshot_ciphertext: string | null;
  share_snapshot_iv: string | null;
  is_public: boolean;
  shared_at: Date | null;
  created_at: Date;
  updated_at: Date;
  item_count: number;
};

export type VaultItemRow = {
  id: number;
  vault_id: number;
  item_type: string;
  label: string;
  encrypted_value: string;
  iv: string;
  crypto_version: number;
  order_index: number;
  created_at: Date;
  updated_at: Date;
};

export type VaultAggregate = { vault: VaultRow; items: VaultItemRow[] };

export type VaultValue = {
  title: string;
  category: string;
  colorValue: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  isLocked: boolean;
  encryptionSalt: string | null;
  masterPasswordHash: string | null;
  cryptoVersion?: number;
  kdfAlgorithm?: string | null;
  kdfMemoryKiB?: number | null;
  kdfIterations?: number | null;
  kdfParallelism?: number | null;
  wrappedVek?: string | null;
  wrappedVekRecovery?: string | null;
};

export type CreateVaultOutcome =
  | { kind: 'created'; row: VaultRow; replayed: boolean }
  | { kind: 'idempotency_conflict' }
  | { kind: 'result_unavailable' };

export type UpdateVaultValue = Partial<
  Pick<
    VaultValue,
    'title' | 'category' | 'colorValue' | 'positionX' | 'positionY' | 'width' | 'height' | 'zIndex'
  >
>;

export type EncryptedVaultItemValue = {
  itemType: string;
  label: string;
  encryptedValue: string;
  iv: string;
  cryptoVersion?: number;
};

export type SetVaultPasswordResult =
  | 'vault-not-found'
  | 'current-password-required'
  | 'invalid-password'
  | 'invalid-lock-state'
  | VaultRow;

export type RemoveVaultPasswordResult =
  | 'vault-not-found'
  | 'invalid-password'
  | 'invalid-lock-state'
  | 'vault-not-locked'
  | VaultRow;

export type EnableVaultSharingResult =
  | 'vault-not-found'
  | 'vault-locked'
  | 'snapshot-required'
  | VaultRow;

export type EnrollVaultV2Result =
  | 'vault-not-found'
  | 'already-enrolled'
  | 'item-set-mismatch'
  | VaultAggregate;

export type RewrapVaultV2Result =
  | 'vault-not-found'
  | 'not-enrolled'
  | VaultRow;

const VAULT_COLUMNS = `
  v.id, v.user_id, v.title, v.category, v.color_value,
  v.position_x, v.position_y, v.width, v.height, v.z_index,
  v.is_locked, v.encryption_salt, v.master_password_hash,
  v.crypto_version, v.kdf_algorithm, v.kdf_memory_kib,
  v.kdf_iterations, v.kdf_parallelism, v.wrapped_vek, v.wrapped_vek_recovery,
  v.share_token, v.share_token_hash, v.share_snapshot_ciphertext, v.share_snapshot_iv,
  v.is_public, v.shared_at, v.created_at, v.updated_at`;

const ITEM_COLUMNS = `
  id, vault_id, item_type, label, encrypted_value, iv, crypto_version,
  order_index, created_at, updated_at`;

@Injectable()
export class VaultRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    userId: number,
    category: string | undefined,
    search: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ rows: VaultRow[]; total: number }> {
    const conditions = ['v.user_id = $1'];
    const values: unknown[] = [userId];
    if (category) {
      values.push(category);
      conditions.push(`v.category = $${values.length}`);
    }
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      conditions.push(`v.title ILIKE $${values.length} ESCAPE '\\'`);
    }
    values.push(pageSize, (page - 1) * pageSize);
    const result = await this.pool.query<VaultRow & { total_count: number }>(
      `SELECT ${VAULT_COLUMNS}, COUNT(vi.id)::int AS item_count,
              COUNT(*) OVER()::int AS total_count
       FROM vaults v
       LEFT JOIN vault_items vi ON vi.vault_id = v.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY v.id
       ORDER BY v.updated_at DESC, v.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      rows: result.rows,
      total: result.rows[0]?.total_count ?? 0,
    };
  }

  async find(userId: number, vaultId: number): Promise<VaultAggregate | null> {
    const client = await this.pool.connect();
    try {
      const vault = await client.query<VaultRow>(
        `SELECT ${VAULT_COLUMNS}, COUNT(vi.id)::int AS item_count
         FROM vaults v
         LEFT JOIN vault_items vi ON vi.vault_id = v.id
         WHERE v.id = $1 AND v.user_id = $2
         GROUP BY v.id`,
        [vaultId, userId],
      );
      if (!vault.rows[0]) return null;
      const items = await client.query<VaultItemRow>(
        `SELECT ${ITEM_COLUMNS}
         FROM vault_items
         WHERE vault_id = $1
         ORDER BY order_index, id`,
        [vaultId],
      );
      return { vault: vault.rows[0], items: items.rows };
    } finally {
      client.release();
    }
  }

  async create(
    userId: number,
    value: VaultValue,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CreateVaultOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [userId]);
      const receipt = await client.query<{
        request_fingerprint: string;
        result_vault_id: number | null;
      }>(
        `SELECT request_fingerprint, result_vault_id
         FROM vault_creation_receipts
         WHERE user_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [userId, idempotencyKey],
      );
      const replay = receipt.rows[0];
      if (replay) {
        if (replay.request_fingerprint !== requestFingerprint) {
          return { kind: 'idempotency_conflict' };
        }
        if (replay.result_vault_id === null) {
          return { kind: 'result_unavailable' };
        }
        const row = await this.selectVaultById(
          client,
          userId,
          Number(replay.result_vault_id),
        );
        return row
          ? { kind: 'created', row, replayed: true }
          : { kind: 'result_unavailable' };
      }
      const result = await client.query<VaultRow>(
        `INSERT INTO vaults (
           user_id, title, category, color_value, position_x, position_y,
           width, height, z_index, is_locked, encryption_salt, master_password_hash,
           crypto_version, kdf_algorithm, kdf_memory_kib, kdf_iterations,
           kdf_parallelism, wrapped_vek, wrapped_vek_recovery
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *, 0::int AS item_count`,
        [
          userId,
          value.title,
          value.category,
          value.colorValue,
          value.positionX,
          value.positionY,
          value.width,
          value.height,
          value.zIndex,
          value.isLocked,
          value.encryptionSalt,
          value.masterPasswordHash,
          value.cryptoVersion ?? 1,
          value.kdfAlgorithm ?? null,
          value.kdfMemoryKiB ?? null,
          value.kdfIterations ?? null,
          value.kdfParallelism ?? null,
          value.wrappedVek ?? null,
          value.wrappedVekRecovery ?? null,
        ],
      );
      const row = result.rows[0];
      await client.query(
        `INSERT INTO vault_creation_receipts (
           user_id, idempotency_key, request_fingerprint, result_vault_id
         ) VALUES ($1,$2,$3,$4)`,
        [userId, idempotencyKey, requestFingerprint, row.id],
      );
      return { kind: 'created', row, replayed: false };
    });
  }

  async update(
    userId: number,
    vaultId: number,
    value: UpdateVaultValue,
  ): Promise<VaultRow | null> {
    const columns: Record<keyof UpdateVaultValue, string> = {
      title: 'title',
      category: 'category',
      colorValue: 'color_value',
      positionX: 'position_x',
      positionY: 'position_y',
      width: 'width',
      height: 'height',
      zIndex: 'z_index',
    };
    const values: unknown[] = [];
    const sets = (Object.entries(value) as Array<[keyof UpdateVaultValue, unknown]>)
      .map(([key, raw]) => {
        values.push(raw);
        return `${columns[key]} = $${values.length}`;
      });
    if (sets.length === 0) {
      const current = await this.find(userId, vaultId);
      return current?.vault ?? null;
    }
    values.push(vaultId, userId);
    const result = await this.pool.query<VaultRow>(
      `UPDATE vaults
       SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING *, (
         SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
       ) AS item_count`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async delete(userId: number, vaultId: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM vaults WHERE id = $1 AND user_id = $2 RETURNING id',
      [vaultId, userId],
    );
    return result.rowCount === 1;
  }

  async setPassword(
    userId: number,
    vaultId: number,
    newPasswordHash: string,
    encryptionSalt: string,
    currentPassword: string | undefined,
    verifyPassword: (password: string, hash: string) => Promise<boolean>,
  ): Promise<SetVaultPasswordResult> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return 'vault-not-found';
      if (current.is_locked) {
        if (!currentPassword) return 'current-password-required';
        if (!current.master_password_hash) return 'invalid-lock-state';
        if (!(await verifyPassword(currentPassword, current.master_password_hash))) {
          return 'invalid-password';
        }
      }
      const result = await client.query<VaultRow>(
        `UPDATE vaults
         SET is_locked = TRUE, encryption_salt = $1,
             master_password_hash = $2,
             is_public = FALSE, share_token = NULL, shared_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4
         RETURNING *, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
         ) AS item_count`,
        [encryptionSalt, newPasswordHash, vaultId, userId],
      );
      return result.rows[0];
    });
  }

  async removePassword(
    userId: number,
    vaultId: number,
    password: string,
    verifyPassword: (password: string, hash: string) => Promise<boolean>,
  ): Promise<RemoveVaultPasswordResult> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return 'vault-not-found';
      if (!current.is_locked) return 'vault-not-locked';
      if (!current.master_password_hash) return 'invalid-lock-state';
      if (!(await verifyPassword(password, current.master_password_hash))) {
        return 'invalid-password';
      }
      const result = await client.query<VaultRow>(
        `UPDATE vaults
         SET is_locked = FALSE, encryption_salt = NULL,
             master_password_hash = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
         ) AS item_count`,
        [vaultId, userId],
      );
      return result.rows[0];
    });
  }

  async enableSharing(
    userId: number,
    vaultId: number,
    shareToken: string,
    options?: {
      shareTokenHash?: string;
      snapshotCiphertext?: string;
      snapshotIv?: string;
    },
  ): Promise<EnableVaultSharingResult> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return 'vault-not-found';
      const isV2 = Number(current.crypto_version ?? 1) >= 2;
      if (current.is_locked && !isV2) return 'vault-locked';
      if (isV2 && !current.is_public && (!options?.snapshotCiphertext || !options.snapshotIv)) {
        return 'snapshot-required';
      }
      if (current.is_public && (current.share_token || current.share_token_hash)) {
        return current;
      }
      const result = await client.query<VaultRow>(
        `UPDATE vaults
         SET share_token = $1, share_token_hash = $4,
             share_snapshot_ciphertext = COALESCE($5, share_snapshot_ciphertext),
             share_snapshot_iv = COALESCE($6, share_snapshot_iv),
             is_public = TRUE, shared_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING *, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
         ) AS item_count`,
        [
          shareToken,
          vaultId,
          userId,
          options?.shareTokenHash ?? null,
          options?.snapshotCiphertext ?? null,
          options?.snapshotIv ?? null,
        ],
      );
      return result.rows[0];
    });
  }

  async disableSharing(
    userId: number,
    vaultId: number,
  ): Promise<VaultRow | null> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return null;
      if (!current.is_public && !current.share_token && !current.shared_at) {
        return current;
      }
      const result = await client.query<VaultRow>(
        `UPDATE vaults
         SET share_token = NULL, share_token_hash = NULL,
             share_snapshot_ciphertext = NULL, share_snapshot_iv = NULL,
             is_public = FALSE, shared_at = NULL
         WHERE id = $1 AND user_id = $2
         RETURNING *, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
         ) AS item_count`,
        [vaultId, userId],
      );
      return result.rows[0];
    });
  }

  async addItem(
    userId: number,
    vaultId: number,
    value: EncryptedVaultItemValue,
  ): Promise<VaultItemRow | null> {
    return this.transaction(async (client) => {
      if (!(await this.lockOwnedVault(client, userId, vaultId))) return null;
      const inserted = await client.query<VaultItemRow>(
        `INSERT INTO vault_items (
           vault_id, item_type, label, encrypted_value, iv, crypto_version, order_index
         )
         SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(order_index), -1) + 1
         FROM vault_items
         WHERE vault_id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [
          vaultId,
          value.itemType,
          value.label,
          value.encryptedValue,
          value.iv,
          value.cryptoVersion ?? 1,
        ],
      );
      await this.touch(client, vaultId);
      return inserted.rows[0];
    });
  }

  async addItems(
    userId: number,
    vaultId: number,
    values: EncryptedVaultItemValue[],
  ): Promise<VaultItemRow[] | null> {
    return this.transaction(async (client) => {
      if (!(await this.lockOwnedVault(client, userId, vaultId))) return null;
      const order = await client.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
         FROM vault_items WHERE vault_id = $1`,
        [vaultId],
      );
      const start = Number(order.rows[0].next_order);
      const result = await client.query<VaultItemRow>(
        `INSERT INTO vault_items (
           vault_id, item_type, label, encrypted_value, iv, crypto_version, order_index
         )
         SELECT $1, item.item_type, item.label, item.encrypted_value, item.iv,
                item.crypto_version, $7 + item.ordinality - 1
         FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
              WITH ORDINALITY AS item(
                item_type, label, encrypted_value, iv, crypto_version, ordinality
              )
         RETURNING ${ITEM_COLUMNS}`,
        [
          vaultId,
          values.map((value) => value.itemType),
          values.map((value) => value.label),
          values.map((value) => value.encryptedValue),
          values.map((value) => value.iv),
          values.map((value) => value.cryptoVersion ?? 1),
          start,
        ],
      );
      await this.touch(client, vaultId);
      return result.rows.sort((a, b) => a.order_index - b.order_index);
    });
  }

  async updateItem(
    userId: number,
    vaultId: number,
    itemId: number,
    value: {
      label?: string;
      encryptedValue?: string;
      iv?: string;
    },
  ): Promise<'vault-not-found' | 'item-not-found' | VaultItemRow> {
    return this.transaction(async (client) => {
      if (!(await this.lockOwnedVault(client, userId, vaultId))) {
        return 'vault-not-found';
      }
      const current = await client.query<VaultItemRow>(
        `SELECT ${ITEM_COLUMNS}
         FROM vault_items
         WHERE id = $1 AND vault_id = $2
         FOR UPDATE`,
        [itemId, vaultId],
      );
      if (!current.rows[0]) return 'item-not-found';
      const row = current.rows[0];
      const result = await client.query<VaultItemRow>(
        `UPDATE vault_items
         SET label = $1, encrypted_value = $2, iv = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND vault_id = $5
         RETURNING ${ITEM_COLUMNS}`,
        [
          value.label ?? row.label,
          value.encryptedValue ?? row.encrypted_value,
          value.iv ?? row.iv,
          itemId,
          vaultId,
        ],
      );
      await this.touch(client, vaultId);
      return result.rows[0];
    });
  }

  async deleteItem(
    userId: number,
    vaultId: number,
    itemId: number,
  ): Promise<'vault-not-found' | 'item-not-found' | true> {
    return this.transaction(async (client) => {
      if (!(await this.lockOwnedVault(client, userId, vaultId))) {
        return 'vault-not-found';
      }
      const removed = await client.query<{ order_index: number }>(
        `DELETE FROM vault_items
         WHERE id = $1 AND vault_id = $2
         RETURNING order_index`,
        [itemId, vaultId],
      );
      if (!removed.rows[0]) return 'item-not-found';
      await client.query(
        `UPDATE vault_items
         SET order_index = order_index - 1, updated_at = CURRENT_TIMESTAMP
         WHERE vault_id = $1 AND order_index > $2`,
        [vaultId, removed.rows[0].order_index],
      );
      await this.touch(client, vaultId);
      return true;
    });
  }

  async reorderItems(
    userId: number,
    vaultId: number,
    itemIds: number[],
  ): Promise<
    | 'vault-not-found'
    | 'item-set-mismatch'
    | VaultItemRow[]
  > {
    return this.transaction(async (client) => {
      if (!(await this.lockOwnedVault(client, userId, vaultId))) {
        return 'vault-not-found';
      }
      const current = await client.query<{ id: number }>(
        `SELECT id FROM vault_items
         WHERE vault_id = $1
         ORDER BY order_index, id
         FOR UPDATE`,
        [vaultId],
      );
      const actual = current.rows.map((row) => row.id).sort((a, b) => a - b);
      const requested = [...itemIds].sort((a, b) => a - b);
      if (
        actual.length !== requested.length ||
        actual.some((id, index) => id !== requested[index])
      ) {
        return 'item-set-mismatch';
      }
      await client.query(
        `UPDATE vault_items AS item
         SET order_index = (ordered.position - 1)::int,
             updated_at = CURRENT_TIMESTAMP
         FROM UNNEST($1::int[]) WITH ORDINALITY AS ordered(id, position)
         WHERE item.id = ordered.id AND item.vault_id = $2`,
        [itemIds, vaultId],
      );
      await this.touch(client, vaultId);
      const result = await client.query<VaultItemRow>(
        `SELECT ${ITEM_COLUMNS}
         FROM vault_items
         WHERE vault_id = $1
         ORDER BY order_index, id`,
        [vaultId],
      );
      return result.rows;
    });
  }

  async enrollV2(
    userId: number,
    vaultId: number,
    value: {
      encryptionSalt: string;
      kdfMemoryKiB: number;
      kdfIterations: number;
      kdfParallelism: number;
      wrappedVek: string;
      wrappedVekRecovery: string | null;
      items: Array<{ id: number; ciphertext: string; iv: string }>;
    },
  ): Promise<EnrollVaultV2Result> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return 'vault-not-found';
      if (Number(current.crypto_version ?? 1) >= 2) return 'already-enrolled';
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM vault_items WHERE vault_id = $1 ORDER BY id FOR UPDATE`,
        [vaultId],
      );
      const actual = existing.rows.map((row) => row.id).sort((a, b) => a - b);
      const requested = value.items.map((item) => item.id).sort((a, b) => a - b);
      if (
        actual.length !== requested.length ||
        actual.some((id, index) => id !== requested[index])
      ) {
        return 'item-set-mismatch';
      }
      for (const item of value.items) {
        await client.query(
          `UPDATE vault_items
           SET label = '', encrypted_value = $1, iv = $2, crypto_version = 2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND vault_id = $4`,
          [item.ciphertext, item.iv, item.id, vaultId],
        );
      }
      await client.query(
        `UPDATE vaults
         SET crypto_version = 2, is_locked = TRUE,
             encryption_salt = $1, kdf_algorithm = 'argon2id',
             kdf_memory_kib = $2, kdf_iterations = $3, kdf_parallelism = $4,
             wrapped_vek = $5, wrapped_vek_recovery = $6,
             master_password_hash = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7 AND user_id = $8`,
        [
          value.encryptionSalt,
          value.kdfMemoryKiB,
          value.kdfIterations,
          value.kdfParallelism,
          value.wrappedVek,
          value.wrappedVekRecovery,
          vaultId,
          userId,
        ],
      );
      const enrolled = await client.query<VaultRow>(
        `SELECT ${VAULT_COLUMNS}, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = v.id
         ) AS item_count
         FROM vaults v
         WHERE v.id = $1 AND v.user_id = $2`,
        [vaultId, userId],
      );
      const items = await client.query<VaultItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM vault_items WHERE vault_id = $1
         ORDER BY order_index, id`,
        [vaultId],
      );
      return { vault: enrolled.rows[0], items: items.rows };
    });
  }

  async rewrapV2(
    userId: number,
    vaultId: number,
    wrappedVek: string,
    wrappedVekRecovery: string | null,
  ): Promise<RewrapVaultV2Result> {
    return this.transaction(async (client) => {
      const current = await this.lockOwnedVaultRow(client, userId, vaultId);
      if (!current) return 'vault-not-found';
      if (Number(current.crypto_version ?? 1) < 2) return 'not-enrolled';
      const result = await client.query<VaultRow>(
        `UPDATE vaults
         SET wrapped_vek = $1, wrapped_vek_recovery = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4
         RETURNING *, (
           SELECT COUNT(*)::int FROM vault_items WHERE vault_id = vaults.id
         ) AS item_count`,
        [wrappedVek, wrappedVekRecovery, vaultId, userId],
      );
      return result.rows[0];
    });
  }

  private async lockOwnedVault(
    client: PoolClient,
    userId: number,
    vaultId: number,
  ): Promise<boolean> {
    return Boolean(await this.lockOwnedVaultRow(client, userId, vaultId));
  }

  private async lockOwnedVaultRow(
    client: PoolClient,
    userId: number,
    vaultId: number,
  ): Promise<VaultRow | null> {
    const result = await client.query<VaultRow>(
      `SELECT ${VAULT_COLUMNS}, (
         SELECT COUNT(*)::int FROM vault_items WHERE vault_id = v.id
       ) AS item_count
       FROM vaults v
       WHERE v.id = $1 AND v.user_id = $2
       FOR UPDATE`,
      [vaultId, userId],
    );
    return result.rows[0] ?? null;
  }

  private async selectVaultById(
    client: PoolClient,
    userId: number,
    vaultId: number,
  ): Promise<VaultRow | null> {
    const result = await client.query<VaultRow>(
      `SELECT ${VAULT_COLUMNS}, COUNT(vi.id)::int AS item_count
       FROM vaults v
       LEFT JOIN vault_items vi ON vi.vault_id = v.id
       WHERE v.id = $1 AND v.user_id = $2
       GROUP BY v.id`,
      [vaultId, userId],
    );
    return result.rows[0] ?? null;
  }

  private async touch(client: PoolClient, vaultId: number): Promise<void> {
    await client.query(
      `UPDATE vaults SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [vaultId],
    );
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
