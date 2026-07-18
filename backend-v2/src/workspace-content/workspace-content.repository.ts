import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

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

@Injectable()
export class WorkspaceContentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

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
}
