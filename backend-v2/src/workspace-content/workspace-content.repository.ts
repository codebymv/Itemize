import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { RealtimeOutboxService } from '../realtime-outbox/realtime-outbox.service';

export type WorkspaceListItemRow = {
  id: string;
  text: string;
  completed: boolean;
};

export type WorkspaceListRow = {
  id: number;
  user_id: number;
  title: string;
  category: string | null;
  category_id: number | null;
  items: unknown;
  color_value: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  z_index: number | null;
  share_token: string | null;
  is_public: boolean | null;
  shared_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type WorkspaceNoteRow = {
  id: number;
  user_id: number;
  title: string | null;
  content: string | null;
  category: string | null;
  category_id: number | null;
  color_value: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  z_index: number | null;
  share_token: string | null;
  is_public: boolean | null;
  shared_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type WorkspaceContentCriteria = {
  userId: number;
  search?: string;
  categoryId?: number;
  pageSize: number;
  offset: number;
};

type QueryParts = {
  from: string;
  where: string;
  parameters: unknown[];
};

export type CreateWorkspaceNoteValues = {
  title: string;
  content: string;
  category: string;
  colorValue: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  zIndex: number;
};

export type UpdateWorkspaceNoteValues = Partial<CreateWorkspaceNoteValues> & {
  mutationId: string;
  eventType: string;
};

export type WorkspaceNoteMutationOutcome =
  | { kind: 'completed'; row: WorkspaceNoteRow }
  | { kind: 'not_found' }
  | { kind: 'category_not_found' };

export type DeleteWorkspaceNoteOutcome =
  | { kind: 'deleted'; deletedId: number }
  | { kind: 'not_found' };

type CategoryIdentity = {
  id: number;
  name: string;
};

const noteMutationSelection = `
  id,
  user_id,
  title,
  content,
  category,
  category_id,
  color_value,
  position_x,
  position_y,
  width,
  height,
  z_index,
  share_token,
  is_public,
  shared_at,
  created_at,
  updated_at`;

@Injectable()
export class WorkspaceContentRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly realtimeOutbox: RealtimeOutboxService,
  ) {}

  async findLists(
    criteria: WorkspaceContentCriteria,
  ): Promise<{ rows: WorkspaceListRow[]; total: number }> {
    const query = this.queryParts('lists', criteria, false);
    const [count, rows] = await Promise.all([
      this.pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total ${query.from} ${query.where}`,
        query.parameters,
      ),
      this.pool.query<WorkspaceListRow>(
        `SELECT
           content.id,
           content.user_id,
           content.title,
           COALESCE(NULLIF(content.category, ''), 'General') AS category,
           category.id AS category_id,
           content.items,
           content.color_value,
           content.position_x,
           content.position_y,
           content.width,
           content.height,
           content.z_index,
           content.share_token,
           content.is_public,
           content.shared_at,
           content.created_at,
           content.updated_at
         ${query.from}
         ${query.where}
         ORDER BY content.updated_at DESC, content.id DESC
         LIMIT $${query.parameters.length + 1}
         OFFSET $${query.parameters.length + 2}`,
        [...query.parameters, criteria.pageSize, criteria.offset],
      ),
    ]);
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findNotes(
    criteria: WorkspaceContentCriteria,
  ): Promise<{ rows: WorkspaceNoteRow[]; total: number }> {
    const query = this.queryParts('notes', criteria, true);
    const [count, rows] = await Promise.all([
      this.pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total ${query.from} ${query.where}`,
        query.parameters,
      ),
      this.pool.query<WorkspaceNoteRow>(
        `SELECT
           content.id,
           content.user_id,
           content.title,
           content.content,
           COALESCE(NULLIF(content.category, ''), 'General') AS category,
           category.id AS category_id,
           content.color_value,
           content.position_x,
           content.position_y,
           content.width,
           content.height,
           content.z_index,
           content.share_token,
           content.is_public,
           content.shared_at,
           content.created_at,
           content.updated_at
         ${query.from}
         ${query.where}
         ORDER BY content.updated_at DESC, content.id DESC
         LIMIT $${query.parameters.length + 1}
         OFFSET $${query.parameters.length + 2}`,
        [...query.parameters, criteria.pageSize, criteria.offset],
      ),
    ]);
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async createNote(
    userId: number,
    values: CreateWorkspaceNoteValues,
  ): Promise<WorkspaceNoteMutationOutcome> {
    return this.transaction(async (client) => {
      const category = await this.categoryForCreate(
        client,
        userId,
        values.category,
      );
      if (!category) return { kind: 'category_not_found' };

      const result = await client.query<WorkspaceNoteRow>(
        `INSERT INTO notes (
           user_id, title, content, category, category_id, color_value,
           position_x, position_y, width, height, z_index
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${noteMutationSelection}`,
        [
          userId,
          values.title,
          values.content,
          category.name,
          category.id,
          values.colorValue,
          values.positionX,
          values.positionY,
          values.width,
          values.height,
          values.zIndex,
        ],
      );
      return { kind: 'completed', row: result.rows[0] };
    });
  }

  private async categoryForCreate(
    client: PoolClient,
    userId: number,
    name: string,
  ): Promise<CategoryIdentity | null> {
    const existing = await this.category(client, userId, name);
    if (existing || name.toLowerCase() !== 'general') return existing;

    const created = await client.query<CategoryIdentity>(
      `INSERT INTO categories (user_id, name, color_value)
       VALUES ($1, 'General', '#6B7280')
       ON CONFLICT (user_id, name)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [userId],
    );
    return created.rows[0] ?? null;
  }

  async updateNote(
    userId: number,
    noteId: number,
    values: UpdateWorkspaceNoteValues,
  ): Promise<WorkspaceNoteMutationOutcome> {
    return this.transaction(async (client) => {
      const currentResult = await client.query<WorkspaceNoteRow>(
        `SELECT ${noteMutationSelection}
         FROM notes
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [noteId, userId],
      );
      const current = currentResult.rows[0];
      if (!current) return { kind: 'not_found' };

      const category = await this.category(
        client,
        userId,
        values.category ?? current.category ?? 'General',
      );
      if (!category) return { kind: 'category_not_found' };

      const updatedResult = await client.query<WorkspaceNoteRow>(
        `UPDATE notes SET
           title = $1,
           content = $2,
           category = $3,
           category_id = $4,
           color_value = $5,
           position_x = $6,
           position_y = $7,
           width = $8,
           height = $9,
           z_index = $10,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $11 AND user_id = $12
         RETURNING ${noteMutationSelection}`,
        [
          values.title ?? current.title,
          values.content ?? current.content,
          category.name,
          category.id,
          values.colorValue ?? current.color_value,
          values.positionX ?? current.position_x,
          values.positionY ?? current.position_y,
          values.width ?? current.width,
          values.height ?? current.height,
          values.zIndex ?? current.z_index,
          noteId,
          userId,
        ],
      );
      const updated = updatedResult.rows[0];
      if (updated.is_public && updated.share_token) {
        await this.realtimeOutbox.enqueue(client, {
          eventKey: `note:${noteId}:update:${values.mutationId}:shared`,
          aggregateType: 'note',
          aggregateId: noteId,
          channel: 'shared_note',
          recipientKey: updated.share_token,
          eventName: 'noteUpdated',
          eventType: values.eventType,
          payload: this.updatePayload(updated, values.eventType),
          occurredAt: new Date(updated.updated_at),
        });
      }
      return { kind: 'completed', row: updated };
    });
  }

  async deleteNote(
    userId: number,
    noteId: number,
    mutationId: string,
  ): Promise<DeleteWorkspaceNoteOutcome> {
    return this.transaction(async (client) => {
      const currentResult = await client.query<
        WorkspaceNoteRow & { mutation_occurred_at: Date }
      >(
        `SELECT ${noteMutationSelection},
                CURRENT_TIMESTAMP AS mutation_occurred_at
         FROM notes
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [noteId, userId],
      );
      const current = currentResult.rows[0];
      if (!current) return { kind: 'not_found' };

      await client.query(
        'DELETE FROM notes WHERE id = $1 AND user_id = $2',
        [noteId, userId],
      );
      if (current.is_public && current.share_token) {
        await this.realtimeOutbox.enqueue(client, {
          eventKey: `note:${noteId}:delete:${mutationId}:shared`,
          aggregateType: 'note',
          aggregateId: noteId,
          channel: 'shared_note',
          recipientKey: current.share_token,
          eventName: 'noteUpdated',
          eventType: 'noteDeleted',
          payload: {
            id: noteId,
            message: 'This note has been deleted by the owner',
          },
          occurredAt: new Date(current.mutation_occurred_at),
        });
      }
      return { kind: 'deleted', deletedId: noteId };
    });
  }

  private queryParts(
    table: 'lists' | 'notes',
    criteria: WorkspaceContentCriteria,
    searchContent: boolean,
  ): QueryParts {
    const parameters: unknown[] = [criteria.userId];
    const clauses = ['content.user_id = $1'];
    const categoryExpression =
      `COALESCE(NULLIF(content.category, ''), 'General')`;
    const from = `FROM ${table} content
      LEFT JOIN categories category
        ON category.user_id = content.user_id
       AND category.name = ${categoryExpression}`;

    if (criteria.categoryId !== undefined) {
      parameters.push(criteria.categoryId);
      clauses.push(`category.id = $${parameters.length}`);
    }
    if (criteria.search) {
      parameters.push(`%${criteria.search}%`);
      clauses.push(
        searchContent
          ? `(content.title ILIKE $${parameters.length} OR content.content ILIKE $${parameters.length})`
          : `content.title ILIKE $${parameters.length}`,
      );
    }
    return {
      from,
      where: `WHERE ${clauses.join(' AND ')}`,
      parameters,
    };
  }

  private async category(
    client: PoolClient,
    userId: number,
    name: string,
  ): Promise<CategoryIdentity | null> {
    const result = await client.query<CategoryIdentity>(
      `SELECT id, name
       FROM categories
       WHERE user_id = $1 AND lower(name) = lower($2)
       ORDER BY id
       LIMIT 1
       FOR KEY SHARE`,
      [userId, name],
    );
    return result.rows[0] ?? null;
  }

  private updatePayload(
    note: WorkspaceNoteRow,
    eventType: string,
  ): Record<string, unknown> {
    const updatedAt = new Date(note.updated_at).toISOString();
    if (eventType === 'CONTENT_CHANGED') {
      return { id: note.id, content: note.content, updated_at: updatedAt };
    }
    if (eventType === 'TITLE_CHANGED') {
      return { id: note.id, title: note.title, updated_at: updatedAt };
    }
    if (eventType === 'CATEGORY_CHANGED') {
      return { id: note.id, category: note.category, updated_at: updatedAt };
    }
    return {
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      color_value: note.color_value,
      updated_at: updatedAt,
    };
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
