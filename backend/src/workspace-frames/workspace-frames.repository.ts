import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type WorkspaceFrameRow = {
  id: number;
  user_id: number;
  title: string;
  category: string | null;
  color_value: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  contact_id: number | null;
  contact_name: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

export type WorkspaceFrameValues = {
  title: string;
  category: string | null;
  colorValue: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  contactId: number | null;
};

export type UpdateWorkspaceFrameValues = Partial<WorkspaceFrameValues> & {
  mutationId: string;
  expectedUpdatedAt: Date;
};

export type WorkspaceFrameCreationOutcome =
  | { kind: 'completed'; row: WorkspaceFrameRow }
  | { kind: 'idempotency_conflict' }
  | { kind: 'receipt_inconsistent' }
  | { kind: 'contact_not_found' }
  | { kind: 'category_not_found' };

export type WorkspaceFrameUpdateOutcome =
  | { kind: 'completed'; row: WorkspaceFrameRow }
  | { kind: 'not_found' }
  | { kind: 'conflict'; currentUpdatedAt: Date }
  | { kind: 'contact_not_found' }
  | { kind: 'category_not_found' };

export type DeleteWorkspaceFrameOutcome =
  | { kind: 'deleted'; deletedId: number }
  | { kind: 'not_found' };

const frameSelection = `
  id, user_id, title, category, color_value, position_x, position_y, width, height,
  z_index, contact_id,
  (
    SELECT COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', contact.first_name, contact.last_name)), ''),
      contact.company,
      contact.email
    )
    FROM contacts contact
    WHERE contact.id = workspace_frames.contact_id
  ) AS contact_name,
  created_at, updated_at, archived_at
`;

/**
 * Frames share the workspace creation-receipt table with the card types so a
 * retried create replays instead of duplicating; the claim/complete steps
 * mirror WorkspaceContentRepository's.
 */
@Injectable()
export class WorkspaceFramesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findFrames(
    userId: number,
    pageSize: number,
    offset: number,
    archived: 'active' | 'archived' | 'all' = 'active',
  ): Promise<{ rows: WorkspaceFrameRow[]; total: number }> {
    const archiveClause = archived === 'active'
      ? 'AND archived_at IS NULL'
      : archived === 'archived' ? 'AND archived_at IS NOT NULL' : '';
    const [count, rows] = await Promise.all([
      this.pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM workspace_frames WHERE user_id = $1 ${archiveClause}`,
        [userId],
      ),
      this.pool.query<WorkspaceFrameRow>(
        `SELECT ${frameSelection}
         FROM workspace_frames
         WHERE user_id = $1 ${archiveClause}
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      ),
    ]);
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findFrame(userId: number, frameId: number): Promise<WorkspaceFrameRow | null> {
    const result = await this.pool.query<WorkspaceFrameRow>(
      `SELECT ${frameSelection} FROM workspace_frames WHERE id = $1 AND user_id = $2`,
      [frameId, userId],
    );
    return result.rows[0] ?? null;
  }

  async createFrame(
    userId: number,
    values: WorkspaceFrameValues,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<WorkspaceFrameCreationOutcome> {
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO workspace_creation_receipts (
           user_id, idempotency_key, entity_type, request_fingerprint
         ) VALUES ($1, $2, 'frame', $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
        [userId, idempotencyKey, requestFingerprint],
      );
      const receipt = await client.query<{
        entity_type: string;
        request_fingerprint: string;
        entity_id: number | null;
      }>(
        `SELECT entity_type, request_fingerprint, entity_id
         FROM workspace_creation_receipts
         WHERE user_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [userId, idempotencyKey],
      );
      const claim = receipt.rows[0];
      if (!claim) return { kind: 'receipt_inconsistent' };
      if (claim.entity_type !== 'frame' || claim.request_fingerprint !== requestFingerprint) {
        return { kind: 'idempotency_conflict' };
      }
      if (claim.entity_id !== null) {
        const replay = await client.query<WorkspaceFrameRow>(
          `SELECT ${frameSelection} FROM workspace_frames WHERE id = $1 AND user_id = $2`,
          [claim.entity_id, userId],
        );
        return replay.rows[0]
          ? { kind: 'completed', row: replay.rows[0] }
          : { kind: 'receipt_inconsistent' };
      }
      if (
        values.contactId !== null
        && !(await this.canBindContact(client, userId, values.contactId))
      ) {
        return { kind: 'contact_not_found' };
      }
      const category = values.category === null ? null : await this.categoryName(client, userId, values.category);
      if (values.category !== null && category === null) return { kind: 'category_not_found' };

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO workspace_frames (
           user_id, title, color_value, position_x, position_y, width, height, contact_id, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          userId,
          values.title,
          values.colorValue,
          values.positionX,
          values.positionY,
          values.width,
          values.height,
          values.contactId,
          category,
        ],
      );
      const frameId = Number(inserted.rows[0].id);
      const completed = await client.query(
        `UPDATE workspace_creation_receipts
         SET entity_id = $3, completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND idempotency_key = $2 AND entity_id IS NULL`,
        [userId, idempotencyKey, frameId],
      );
      if (completed.rowCount !== 1) {
        throw new Error('Workspace creation receipt could not be completed');
      }
      const row = await client.query<WorkspaceFrameRow>(
        `SELECT ${frameSelection} FROM workspace_frames WHERE id = $1 AND user_id = $2`,
        [frameId, userId],
      );
      return { kind: 'completed', row: row.rows[0] };
    });
  }

  async updateFrame(
    userId: number,
    frameId: number,
    values: UpdateWorkspaceFrameValues,
  ): Promise<WorkspaceFrameUpdateOutcome> {
    return this.transaction(async (client) => {
      const currentResult = await client.query<WorkspaceFrameRow>(
        `SELECT ${frameSelection}
         FROM workspace_frames
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [frameId, userId],
      );
      const current = currentResult.rows[0];
      if (!current) return { kind: 'not_found' };
      if (
        new Date(current.updated_at).getTime()
        !== values.expectedUpdatedAt.getTime()
      ) {
        return { kind: 'conflict', currentUpdatedAt: new Date(current.updated_at) };
      }
      if (
        typeof values.contactId === 'number'
        && !(await this.canBindContact(client, userId, values.contactId))
      ) {
        return { kind: 'contact_not_found' };
      }
      const contactId = values.contactId === undefined
        ? current.contact_id
        : values.contactId;
      let category = values.category === undefined ? current.category : values.category;
      if (values.category !== undefined && values.category !== null) {
        category = await this.categoryName(client, userId, values.category);
        if (category === null) return { kind: 'category_not_found' };
      }

      await client.query(
        `UPDATE workspace_frames SET
           title = $1,
           color_value = $2,
           position_x = $3,
           position_y = $4,
           width = $5,
           height = $6,
           contact_id = $7,
           category = $10,
           updated_at = GREATEST(
             clock_timestamp(),
             updated_at + INTERVAL '1 millisecond'
           )
         WHERE id = $8 AND user_id = $9`,
        [
          values.title ?? current.title,
          values.colorValue ?? current.color_value,
          values.positionX ?? current.position_x,
          values.positionY ?? current.position_y,
          values.width ?? current.width,
          values.height ?? current.height,
          contactId,
          frameId,
          userId,
          category,
        ],
      );
      const updated = await client.query<WorkspaceFrameRow>(
        `SELECT ${frameSelection} FROM workspace_frames WHERE id = $1 AND user_id = $2`,
        [frameId, userId],
      );
      return { kind: 'completed', row: updated.rows[0] };
    });
  }

  async deleteFrame(userId: number, frameId: number): Promise<DeleteWorkspaceFrameOutcome> {
    const result = await this.pool.query(
      'DELETE FROM workspace_frames WHERE id = $1 AND user_id = $2',
      [frameId, userId],
    );
    return result.rowCount === 1
      ? { kind: 'deleted', deletedId: frameId }
      : { kind: 'not_found' };
  }

  /** Categories are the owner's own rows; the stored name takes the row's casing, like cards do. */
  private async categoryName(client: PoolClient, userId: number, name: string): Promise<string | null> {
    const result = await client.query<{ name: string }>(
      'SELECT name FROM categories WHERE user_id = $1 AND lower(name) = lower($2) ORDER BY id LIMIT 1',
      [userId, name],
    );
    return result.rows[0]?.name ?? null;
  }

  /** Same rule as card bindings: the owner must currently belong to the contact's organization. */
  private async canBindContact(
    client: PoolClient,
    userId: number,
    contactId: number,
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1
       FROM contacts contact
       JOIN organization_members membership
         ON membership.organization_id = contact.organization_id
        AND membership.user_id = $2
       WHERE contact.id = $1`,
      [contactId, userId],
    );
    return result.rowCount === 1;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
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
