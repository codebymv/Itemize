import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
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
  share_token: string | null;
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
};

export type UpdateVaultValue = Partial<
  Pick<
    VaultValue,
    'title' | 'category' | 'colorValue' | 'positionX' | 'positionY' | 'width' | 'height' | 'zIndex'
  >
>;

const VAULT_COLUMNS = `
  v.id, v.user_id, v.title, v.category, v.color_value,
  v.position_x, v.position_y, v.width, v.height, v.z_index,
  v.is_locked, v.encryption_salt, v.master_password_hash,
  v.share_token, v.is_public, v.shared_at, v.created_at, v.updated_at`;

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
        `SELECT id, vault_id, item_type, label, encrypted_value, iv,
                order_index, created_at, updated_at
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

  async create(userId: number, value: VaultValue): Promise<VaultRow> {
    const result = await this.pool.query<VaultRow>(
      `INSERT INTO vaults (
         user_id, title, category, color_value, position_x, position_y,
         width, height, z_index, is_locked, encryption_salt, master_password_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      ],
    );
    return result.rows[0];
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
}
