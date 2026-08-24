import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import {
  AudienceValidationError,
  SegmentDefinition,
  compileSegmentCondition,
} from '../campaigns/audience.compiler';
import { PG_POOL } from '../database/database.module';

export type SegmentRow = {
  id: number; organization_id: number; name: string; description: string | null;
  color: string; icon: string; filter_type: string; filters: unknown[];
  segment_type: string; static_contact_ids: number[]; contact_count: number;
  last_calculated_at: Date | null; is_active: boolean; used_in_campaigns: number;
  used_in_automations: number; created_by: number | null; created_by_name: string | null;
  created_at: Date; updated_at: Date;
};

export type SegmentHistoryRow = {
  id: number; segment_id: number; organization_id: number; contact_count: number;
  calculated_at: Date; contacts_added: number; contacts_removed: number; created_at: Date;
};

export type SegmentValues = {
  name: string; description: string | null; color: string; icon: string;
  isActive: boolean; definition: SegmentDefinition;
};

export type SegmentContactRow = {
  id: number; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; status: string | null;
  source: string | null; assigned_to: number | null;
  custom_fields: Record<string, unknown> | null; created_at: Date; updated_at: Date;
};

export type SegmentFilterOptionsRows = {
  tags: Array<{ id: number; name: string; color: string }>;
  users: Array<{ id: number; name: string }>;
  pipelines: Array<{ id: number; name: string; stages: unknown }>;
};

export type SegmentMutationOutcome =
  | { kind: 'ok'; row: SegmentRow }
  | { kind: 'not_found' };

export type DeleteSegmentOutcome = 'deleted' | 'not_found' | 'in_use';

const selection = `
  s.id, s.organization_id, s.name, s.description, s.color, s.icon,
  s.filter_type, s.filters, s.segment_type, s.static_contact_ids,
  s.contact_count, s.last_calculated_at, s.is_active, s.used_in_campaigns,
  s.used_in_automations, s.created_by, creator.name AS created_by_name,
  s.created_at, s.updated_at`;

const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(
    Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)),
  );
});

@Injectable()
export class SegmentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(input: {
    organizationId: number; isActive?: boolean; search?: string;
    pageSize: number; offset: number;
  }): Promise<{ rows: SegmentRow[]; total: number }> {
    const clauses = ['s.organization_id = $1'];
    const params: unknown[] = [input.organizationId];
    if (input.isActive !== undefined) {
      params.push(input.isActive);
      clauses.push(`s.is_active = $${params.length}`);
    }
    if (input.search) {
      params.push(`%${input.search}%`);
      clauses.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }
    const count = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM segments s
       WHERE ${clauses.join(' AND ')}`,
      params,
    );
    params.push(input.pageSize, input.offset);
    const result = await this.pool.query<SegmentRow>(
      `SELECT ${selection}
       FROM segments s LEFT JOIN users creator ON creator.id = s.created_by
       WHERE ${clauses.join(' AND ')}
       ORDER BY lower(s.name), s.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows: result.rows, total: Number(count.rows[0].total) };
  }

  async findById(
    organizationId: number,
    segmentId: number,
  ): Promise<{ row: SegmentRow; history: SegmentHistoryRow[] } | null> {
    const client = await this.pool.connect();
    try {
      const row = await this.selectById(client, organizationId, segmentId);
      if (!row) return null;
      const history = await client.query<SegmentHistoryRow>(
        `SELECT id, segment_id, organization_id, contact_count, calculated_at,
                contacts_added, contacts_removed, created_at
         FROM segment_history
         WHERE segment_id = $1 AND organization_id = $2
         ORDER BY calculated_at DESC, id DESC LIMIT 30`,
        [segmentId, organizationId],
      );
      return { row, history: history.rows };
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: SegmentValues,
  ): Promise<SegmentRow> {
    return this.transaction(async (client) => {
      await this.validateReferences(client, organizationId, values.definition);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO segments (
           organization_id, name, description, color, icon, filter_type, filters,
           segment_type, static_contact_ids, is_active, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::int[],$10,$11) RETURNING id`,
        [organizationId, values.name, values.description, values.color, values.icon,
          values.definition.filter_type, JSON.stringify(values.definition.filters),
          values.definition.segment_type, values.definition.static_contact_ids,
          values.isActive, userId],
      );
      const id = Number(inserted.rows[0].id);
      const current = await this.selectById(client, organizationId, id, true);
      if (!current) throw new Error('Segment disappeared inside its transaction');
      await this.calculateCount(client, current);
      const row = await this.selectById(client, organizationId, id);
      if (!row) throw new Error('Segment disappeared after calculation');
      return row;
    });
  }

  async update(
    organizationId: number,
    segmentId: number,
    buildValues: (current: SegmentRow) => SegmentValues,
  ): Promise<SegmentMutationOutcome> {
    return this.transaction(async (client) => {
      const current = await this.selectById(client, organizationId, segmentId, true);
      if (!current) return { kind: 'not_found' };
      const values = buildValues(current);
      await this.validateReferences(client, organizationId, values.definition);
      const currentDefinition = canonicalJson({
        segment_type: current.segment_type, filter_type: current.filter_type,
        filters: current.filters, static_contact_ids: current.static_contact_ids,
      });
      const nextDefinition = canonicalJson(values.definition);
      await client.query(
        `UPDATE segments SET name=$1, description=$2, color=$3, icon=$4,
           filter_type=$5, filters=$6::jsonb, segment_type=$7,
           static_contact_ids=$8::int[], is_active=$9, updated_at=CURRENT_TIMESTAMP
         WHERE id=$10 AND organization_id=$11`,
        [values.name, values.description, values.color, values.icon,
          values.definition.filter_type, JSON.stringify(values.definition.filters),
          values.definition.segment_type, values.definition.static_contact_ids,
          values.isActive, segmentId, organizationId],
      );
      if (currentDefinition !== nextDefinition) {
        const updated = await this.selectById(client, organizationId, segmentId, true);
        if (!updated) throw new Error('Segment disappeared inside its update');
        await this.calculateCount(client, updated);
      }
      const row = await this.selectById(client, organizationId, segmentId);
      if (!row) throw new Error('Segment disappeared after update');
      return { kind: 'ok', row };
    });
  }

  async recalculate(organizationId: number, segmentId: number): Promise<SegmentMutationOutcome> {
    return this.transaction(async (client) => {
      const current = await this.selectById(client, organizationId, segmentId, true);
      if (!current) return { kind: 'not_found' };
      const compiled = compileSegmentCondition(current);
      await this.validateReferences(client, organizationId, compiled.definition);
      await this.calculateCount(client, current);
      const row = await this.selectById(client, organizationId, segmentId);
      if (!row) throw new Error('Segment disappeared after recalculation');
      return { kind: 'ok', row };
    });
  }

  async delete(organizationId: number, segmentId: number): Promise<DeleteSegmentOutcome> {
    return this.transaction(async (client) => {
      const row = await client.query(
        'SELECT id FROM segments WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [segmentId, organizationId],
      );
      if (row.rows.length === 0) return 'not_found';
      const campaign = await client.query(
        'SELECT 1 FROM email_campaigns WHERE segment_id=$1 AND organization_id=$2 LIMIT 1',
        [segmentId, organizationId],
      );
      if (campaign.rows.length > 0) return 'in_use';
      await client.query('DELETE FROM segments WHERE id=$1 AND organization_id=$2', [segmentId, organizationId]);
      return 'deleted';
    });
  }

  async preview(
    organizationId: number,
    definition: SegmentDefinition,
  ): Promise<{ count: number; sample: SegmentContactRow[] }> {
    const client = await this.pool.connect();
    try {
      await this.validateReferences(client, organizationId, definition);
      const { condition, params } = compileSegmentCondition(definition, { startIndex: 2 });
      const queryParams = [organizationId, ...params];
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM contacts c
         WHERE c.organization_id=$1 AND ${condition}`,
        queryParams,
      );
      const sample = await client.query<SegmentContactRow>(
        `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.status,
                c.source, c.assigned_to, c.custom_fields, c.created_at, c.updated_at
         FROM contacts c WHERE c.organization_id=$1 AND ${condition}
         ORDER BY c.created_at DESC, c.id DESC LIMIT 5`,
        queryParams,
      );
      return { count: Number(count.rows[0].total), sample: sample.rows };
    } finally {
      client.release();
    }
  }

  async contacts(input: {
    organizationId: number; segmentId: number; pageSize: number; offset: number;
  }): Promise<{ rows: SegmentContactRow[]; total: number } | null> {
    const client = await this.pool.connect();
    try {
      const segment = await this.selectById(client, input.organizationId, input.segmentId);
      if (!segment) return null;
      const { condition, params } = compileSegmentCondition(segment, { startIndex: 2 });
      const baseParams = [input.organizationId, ...params];
      const total = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM contacts c
         WHERE c.organization_id=$1 AND ${condition}`,
        baseParams,
      );
      const rows = await client.query<SegmentContactRow>(
        `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.status,
                c.source, c.assigned_to, c.custom_fields, c.created_at, c.updated_at
         FROM contacts c WHERE c.organization_id=$1 AND ${condition}
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
        [...baseParams, input.pageSize, input.offset],
      );
      return { rows: rows.rows, total: Number(total.rows[0].total) };
    } finally {
      client.release();
    }
  }

  async filterOptions(organizationId: number): Promise<SegmentFilterOptionsRows> {
    const client = await this.pool.connect();
    try {
      const tags = await client.query<{ id: number; name: string; color: string }>(
        'SELECT id,name,color FROM tags WHERE organization_id=$1 ORDER BY name,id', [organizationId]);
      const users = await client.query<{ id: number; name: string }>(
        `SELECT u.id,u.name FROM users u JOIN organization_members om ON om.user_id=u.id
         WHERE om.organization_id=$1 ORDER BY u.name,u.id`, [organizationId]);
      const pipelines = await client.query<{ id: number; name: string; stages: unknown }>(
        `SELECT id,name,stages FROM pipelines WHERE organization_id=$1
         ORDER BY is_default DESC,name,id`, [organizationId]);
      return { tags: tags.rows, users: users.rows, pipelines: pipelines.rows };
    } finally {
      client.release();
    }
  }

  private async calculateCount(client: PoolClient, segment: SegmentRow): Promise<void> {
    const { condition, params } = compileSegmentCondition(segment, { startIndex: 2 });
    const result = await client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM contacts c
       WHERE c.organization_id=$1 AND ${condition}`,
      [segment.organization_id, ...params],
    );
    const count = Number(result.rows[0].total);
    const previous = Number(segment.contact_count ?? 0);
    await client.query(
      `UPDATE segments SET contact_count=$1,last_calculated_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND organization_id=$3`,
      [count, segment.id, segment.organization_id],
    );
    await client.query(
      `INSERT INTO segment_history
       (segment_id,organization_id,contact_count,contacts_added,contacts_removed)
       VALUES ($1,$2,$3,$4,$5)`,
      [segment.id, segment.organization_id, count,
        Math.max(0, count - previous), Math.max(0, previous - count)],
    );
  }

  private async validateReferences(
    client: PoolClient,
    organizationId: number,
    definition: SegmentDefinition,
  ): Promise<void> {
    const ensure = async (table: string, column: string, ids: number[], field: string) => {
      if (ids.length === 0) return;
      const result = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM ${table}
         WHERE organization_id=$1 AND ${column}=ANY($2::int[])`,
        [organizationId, ids],
      );
      if (Number(result.rows[0].total) !== ids.length) {
        throw new AudienceValidationError(`${field} contains IDs outside the organization`, field);
      }
    };
    await ensure('contacts', 'id', definition.static_contact_ids, 'staticContactIds');
    const filters = definition.filters as Array<{ field: string; operator: string; value?: unknown }>;
    const tagIds = [...new Set(filters.filter((f) => f.field === 'tags').flatMap((f) => f.value as number[]))];
    await ensure('tags', 'id', tagIds, 'filters.tags');
    const users = [...new Set(filters.filter((f) => f.field === 'assigned_to' && f.operator === 'equals').map((f) => Number(f.value)))];
    await ensure('organization_members', 'user_id', users, 'filters.assignedTo');
    const stages = [...new Set(filters.filter((f) => f.field === 'deal_stage' && f.operator === 'in_stage').map((f) => String(f.value)))];
    if (stages.length > 0) {
      const result = await client.query<{ stage_key: string }>(
        `SELECT ps.stage_key FROM pipeline_stages ps JOIN pipelines p ON p.id=ps.pipeline_id
         WHERE p.organization_id=$1`, [organizationId],
      );
      const owned = new Set(result.rows.map((row) => String(row.stage_key)));
      if (stages.some((stage) => !owned.has(stage))) {
        throw new AudienceValidationError('filters.dealStage contains a stage outside the organization', 'filters.dealStage');
      }
    }
  }

  private async selectById(
    client: PoolClient,
    organizationId: number,
    segmentId: number,
    lock = false,
  ): Promise<SegmentRow | null> {
    const result = await client.query<SegmentRow>(
      `SELECT ${selection} FROM segments s LEFT JOIN users creator ON creator.id=s.created_by
       WHERE s.id=$1 AND s.organization_id=$2${lock ? ' FOR UPDATE OF s' : ''}`,
      [segmentId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
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
