import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CategoryRow = {
  id: number;
  user_id: number;
  name: string;
  color_value: string | null;
  created_at: Date;
  updated_at: Date;
};

type CategoryValues = {
  name: string;
  colorValue: string;
};

export type UpdateCategoryOutcome =
  | { kind: 'updated'; row: CategoryRow }
  | { kind: 'not_found' }
  | { kind: 'protected_general' };

export type DeleteCategoryOutcome =
  | { kind: 'deleted' }
  | { kind: 'not_found' }
  | { kind: 'protected_general' }
  | { kind: 'general_missing' };

const categorySelection = `
  id,
  user_id,
  name,
  color_value,
  created_at,
  updated_at`;

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(userId: number): Promise<CategoryRow[]> {
    const result = await this.pool.query<CategoryRow>(
      `SELECT ${categorySelection}
       FROM categories
       WHERE user_id = $1
       ORDER BY lower(name), id`,
      [userId],
    );
    return result.rows;
  }

  async create(userId: number, values: CategoryValues): Promise<CategoryRow> {
    const result = await this.pool.query<CategoryRow>(
      `INSERT INTO categories (user_id, name, color_value)
       VALUES ($1, $2, $3)
       RETURNING ${categorySelection}`,
      [userId, values.name, values.colorValue],
    );
    return result.rows[0];
  }

  async update(
    userId: number,
    categoryId: number,
    values: Partial<CategoryValues>,
  ): Promise<UpdateCategoryOutcome> {
    return this.transaction(async (client) => {
      const currentResult = await client.query<CategoryRow>(
        `SELECT ${categorySelection}
         FROM categories
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [categoryId, userId],
      );
      const current = currentResult.rows[0];
      if (!current) return { kind: 'not_found' };

      const nextName = values.name ?? current.name;
      if (current.name === 'General' && nextName !== 'General') {
        return { kind: 'protected_general' };
      }

      const updatedResult = await client.query<CategoryRow>(
        `UPDATE categories
         SET name = $1,
             color_value = $2
         WHERE id = $3 AND user_id = $4
         RETURNING ${categorySelection}`,
        [
          nextName,
          values.colorValue ?? current.color_value,
          categoryId,
          userId,
        ],
      );

      if (nextName !== current.name) {
        await this.propagateCategory(
          client,
          userId,
          current.name,
          nextName,
          categoryId,
        );
      }
      return { kind: 'updated', row: updatedResult.rows[0] };
    });
  }

  async delete(
    userId: number,
    categoryId: number,
  ): Promise<DeleteCategoryOutcome> {
    return this.transaction(async (client) => {
      const sourceResult = await client.query<CategoryRow>(
        `SELECT ${categorySelection}
         FROM categories
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [categoryId, userId],
      );
      const source = sourceResult.rows[0];
      if (!source) return { kind: 'not_found' };
      if (source.name === 'General') return { kind: 'protected_general' };

      const generalResult = await client.query<CategoryRow>(
        `SELECT ${categorySelection}
         FROM categories
         WHERE user_id = $1 AND name = 'General'
         FOR UPDATE`,
        [userId],
      );
      const general = generalResult.rows[0];
      if (!general) return { kind: 'general_missing' };

      await this.propagateCategory(
        client,
        userId,
        source.name,
        general.name,
        Number(general.id),
      );
      await client.query(
        `DELETE FROM categories
         WHERE id = $1 AND user_id = $2`,
        [categoryId, userId],
      );
      return { kind: 'deleted' };
    });
  }

  private async propagateCategory(
    client: PoolClient,
    userId: number,
    oldName: string,
    newName: string,
    categoryId: number,
  ): Promise<void> {
    await client.query(
      `UPDATE lists
       SET category = $1, category_id = $2
       WHERE user_id = $3 AND category = $4`,
      [newName, categoryId, userId, oldName],
    );
    await client.query(
      `UPDATE notes
       SET category = $1, category_id = $2
       WHERE user_id = $3 AND category = $4`,
      [newName, categoryId, userId, oldName],
    );
    for (const table of ['whiteboards', 'wireframes', 'vaults']) {
      await client.query(
        `UPDATE ${table}
         SET category = $1
         WHERE user_id = $2 AND category = $3`,
        [newName, userId, oldName],
      );
    }
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
