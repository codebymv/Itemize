import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';

type SharedOwnership = {
  organization_id: number | null;
  owner_user_id: number;
};

export type SharedListRow = SharedOwnership & {
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

export type SharedNoteRow = SharedOwnership & {
  id: number;
  title: string;
  content: string | null;
  category: string | null;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
};

export type SharedWhiteboardRow = SharedOwnership & {
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

export type SharedWireframeRow = SharedOwnership & {
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

export type SharedVaultRow = SharedOwnership & {
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
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async sharedList(token: string): Promise<SharedListRow | null> {
    const result = await this.pool.query<SharedListRow>(
      `SELECT l.id, l.title, l.category, l.items, l.color_value, l.created_at, l.updated_at,
              COALESCE(l.organization_id, u.default_organization_id) AS organization_id,
              l.user_id AS owner_user_id,
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
              COALESCE(n.organization_id, u.default_organization_id) AS organization_id,
              n.user_id AS owner_user_id,
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
              COALESCE(w.organization_id, u.default_organization_id) AS organization_id,
              w.user_id AS owner_user_id,
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
              u.default_organization_id AS organization_id,
              w.user_id AS owner_user_id,
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
      `SELECT v.id, v.title, v.category, v.color_value, v.is_locked,
              COALESCE(v.crypto_version, 1) AS crypto_version,
              v.share_snapshot_ciphertext, v.share_snapshot_iv,
              v.created_at, v.updated_at,
              u.default_organization_id AS organization_id,
              v.user_id AS owner_user_id
       FROM vaults v
       JOIN users u ON v.user_id = u.id
       WHERE v.is_public = TRUE
         AND (v.share_token = $1 OR v.share_token_hash = $2)`,
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

  async recordSharedView(input: {
    kind: 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
    id: number;
    title: string;
    organizationId: number;
    ownerUserId: number;
    viewerUserId: number | null;
    occurredAt?: Date;
  }): Promise<void> {
    if (input.viewerUserId === input.ownerUserId) return;
    const occurredAt = input.occurredAt ?? new Date();
    const fifteenMinuteBucket = Math.floor(occurredAt.getTime() / 900_000);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.notifications.createWithClient(client, {
        organizationId: input.organizationId,
        recipientUserId: input.ownerUserId,
        actorUserId: input.viewerUserId,
        eventType: `workspace.${input.kind}.viewed`,
        entityType: input.kind,
        entityId: input.id,
        dedupeKey: `workspace-share:${input.kind}:${input.id}:viewed:${fifteenMinuteBucket}`,
        payload: { contentType: input.kind, contentTitle: input.title },
        category: 'collaboration',
        priority: 'low',
        title: `${input.kind[0].toUpperCase()}${input.kind.slice(1)} viewed`,
        body: `Someone viewed “${input.title}”.`,
        href: '/contents',
        occurredAt,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
