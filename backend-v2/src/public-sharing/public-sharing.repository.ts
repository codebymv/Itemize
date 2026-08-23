import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type SharedListRow = {
  id: number;
  title: string;
  category: string | null;
  items:
    | Array<{ id: string; text: string; completed: boolean }>
    | null;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
};

export type SharedNoteRow = {
  id: number;
  title: string;
  content: string | null;
  category: string | null;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
};

export type SharedWhiteboardRow = {
  id: number;
  title: string;
  category: string | null;
  canvas_data: unknown;
  canvas_width: number | null;
  canvas_height: number | null;
  background_color: string | null;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
};

export type SharedWireframeRow = {
  id: number;
  title: string;
  category: string | null;
  flow_data: unknown;
  width: number | null;
  height: number | null;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
};

export type SharedVaultRow = {
  id: number;
  title: string;
  category: string | null;
  color_value: string | null;
  is_locked: boolean;
  crypto_version: number;
  share_snapshot_ciphertext: string | null;
  share_snapshot_iv: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SharedVaultItemRow = {
  id: number;
  item_type: string;
  label: string;
  encrypted_value: string;
  iv: string;
  order_index: number;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class PublicSharingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async sharedList(token: string): Promise<SharedListRow | null> {
    const result = await this.pool.query<SharedListRow>(
      `SELECT l.id, l.title, l.category, l.items, l.color_value, l.created_at, l.updated_at,
              u.name as creator_name
       FROM lists l
       JOIN users u ON l.user_id = u.id
       WHERE l.share_token = $1 AND l.is_public = TRUE`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  async sharedNote(token: string): Promise<SharedNoteRow | null> {
    const result = await this.pool.query<SharedNoteRow>(
      `SELECT n.id, n.title, n.content, n.category, n.color_value, n.created_at, n.updated_at,
              u.name as creator_name
       FROM notes n
       JOIN users u ON n.user_id = u.id
       WHERE n.share_token = $1 AND n.is_public = TRUE`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  async sharedWhiteboard(token: string): Promise<SharedWhiteboardRow | null> {
    const result = await this.pool.query<SharedWhiteboardRow>(
      `SELECT w.id, w.title, w.category, w.canvas_data, w.canvas_width, w.canvas_height,
              w.background_color, w.color_value, w.created_at, w.updated_at,
              u.name as creator_name
       FROM whiteboards w
       JOIN users u ON w.user_id = u.id
       WHERE w.share_token = $1 AND w.is_public = TRUE`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  async sharedWireframe(token: string): Promise<SharedWireframeRow | null> {
    const result = await this.pool.query<SharedWireframeRow>(
      `SELECT w.id, w.title, w.category, w.flow_data, w.width, w.height,
              w.color_value, w.created_at, w.updated_at,
              u.name AS creator_name
       FROM wireframes w
       JOIN users u ON w.user_id = u.id
       WHERE w.share_token = $1 AND w.is_public = TRUE`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  async sharedVault(
    token: string,
    tokenHash: string,
  ): Promise<SharedVaultRow | null> {
    const result = await this.pool.query<SharedVaultRow>(
      `SELECT id, title, category, color_value, is_locked,
              COALESCE(crypto_version, 1) AS crypto_version,
              share_snapshot_ciphertext, share_snapshot_iv,
              created_at, updated_at
       FROM vaults
       WHERE is_public = TRUE
         AND (share_token = $1 OR share_token_hash = $2)`,
      [token, tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async sharedVaultItems(vaultId: number): Promise<SharedVaultItemRow[]> {
    const result = await this.pool.query<SharedVaultItemRow>(
      `SELECT id, item_type, label, encrypted_value, iv, order_index, created_at, updated_at
       FROM vault_items WHERE vault_id = $1 ORDER BY order_index ASC`,
      [vaultId],
    );
    return result.rows;
  }
}
