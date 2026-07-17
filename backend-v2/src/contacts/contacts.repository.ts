import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ContactSortField, ContactStatus, SortDirection } from './contact.enums';

export type ContactRow = {
  id: number;
  organization_id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  address: Record<string, unknown> | null;
  source: string;
  status: string;
  custom_fields: Record<string, unknown> | null;
  tags: string[] | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ContactCriteria = {
  organizationId: number;
  search?: string;
  status?: ContactStatus;
  tags?: string[];
  assignedToId?: number;
  sortField: ContactSortField;
  sortDirection: SortDirection;
  pageSize: number;
  offset: number;
};

export type ContactCreateValues = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  address: Record<string, unknown>;
  source: string;
  status: string;
  customFields: Record<string, unknown>;
  tags: string[];
  assignedToId: number | null;
};

export type ContactUpdateValues = Partial<{
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  address: Record<string, unknown>;
  source: string;
  status: string;
  customFields: Record<string, unknown>;
  tags: string[];
  assignedToId: number | null;
}>;

export type CreateContactOutcome =
  | { kind: 'created'; row: ContactRow }
  | { kind: 'invalid_assignee' }
  | { kind: 'limit'; current: number; limit: number; plan: string };

export type UpdateContactOutcome =
  | { kind: 'updated'; row: ContactRow; changedFields: string[] }
  | { kind: 'invalid_assignee' }
  | { kind: 'not_found' };

const contactSelection = `
  c.id,
  c.organization_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.company,
  c.job_title,
  c.address,
  c.source,
  c.status,
  c.custom_fields,
  c.tags,
  u_assigned.id AS assigned_to,
  u_assigned.name AS assigned_to_name,
  u_assigned.email AS assigned_to_email,
  u_created.id AS created_by,
  u_created.name AS created_by_name,
  c.created_at,
  c.updated_at`;

const sortColumns: Record<ContactSortField, string> = {
  [ContactSortField.COMPANY]: 'c.company',
  [ContactSortField.CREATED_AT]: 'c.created_at',
  [ContactSortField.EMAIL]: 'c.email',
  [ContactSortField.FIRST_NAME]: 'c.first_name',
  [ContactSortField.LAST_NAME]: 'c.last_name',
  [ContactSortField.UPDATED_AT]: 'c.updated_at',
};

@Injectable()
export class ContactsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: ContactCriteria,
  ): Promise<{ rows: ContactRow[]; total: number }> {
    const client = await this.pool.connect();
    try {
      const { where, parameters } = this.whereClause(criteria);
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM contacts c ${where}`,
        parameters,
      );
      const sortColumn = sortColumns[criteria.sortField];
      const direction = criteria.sortDirection;
      const rows = await client.query<ContactRow>(
        `SELECT ${contactSelection}
         FROM contacts c
         LEFT JOIN organization_members om_assigned
           ON om_assigned.organization_id = c.organization_id
          AND om_assigned.user_id = c.assigned_to
         LEFT JOIN users u_assigned ON u_assigned.id = om_assigned.user_id
         LEFT JOIN organization_members om_created
           ON om_created.organization_id = c.organization_id
          AND om_created.user_id = c.created_by
         LEFT JOIN users u_created ON u_created.id = om_created.user_id
         ${where}
         ORDER BY ${sortColumn} ${direction}, c.id ${direction}
         LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, criteria.pageSize, criteria.offset],
      );
      return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
    } finally {
      client.release();
    }
  }

  async findById(
    organizationId: number,
    contactId: number,
  ): Promise<ContactRow | null> {
    const result = await this.pool.query<ContactRow>(
      `SELECT ${contactSelection}
       FROM contacts c
       LEFT JOIN organization_members om_assigned
         ON om_assigned.organization_id = c.organization_id
        AND om_assigned.user_id = c.assigned_to
       LEFT JOIN users u_assigned ON u_assigned.id = om_assigned.user_id
       LEFT JOIN organization_members om_created
         ON om_created.organization_id = c.organization_id
        AND om_created.user_id = c.created_by
       LEFT JOIN users u_created ON u_created.id = om_created.user_id
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, contactId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    organizationId: number,
    userId: number,
    values: ContactCreateValues,
  ): Promise<CreateContactOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const organization = await client.query<{
        plan: string | null;
        contacts_limit: number | null;
      }>('SELECT plan, contacts_limit FROM organizations WHERE id = $1', [organizationId]);
      const plan = organization.rows[0]?.plan ?? 'starter';
      const limit = organization.rows[0]?.contacts_limit ?? this.defaultLimit(plan);
      const count = await client.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1',
        [organizationId],
      );
      const current = count.rows[0]?.total ?? 0;
      if (limit !== -1 && current >= limit) {
        return { kind: 'limit', current, limit, plan };
      }
      if (!(await this.isMember(client, organizationId, values.assignedToId))) {
        return { kind: 'invalid_assignee' };
      }

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO contacts (
           organization_id, first_name, last_name, email, phone,
           company, job_title, address, source, status,
           custom_fields, tags, assigned_to, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
           $11::jsonb, $12::text[], $13, $14
         ) RETURNING id`,
        [
          organizationId,
          values.firstName,
          values.lastName,
          values.email,
          values.phone,
          values.company,
          values.jobTitle,
          JSON.stringify(values.address),
          values.source,
          values.status,
          JSON.stringify(values.customFields),
          values.tags,
          values.assignedToId,
          userId,
        ],
      );
      const contactId = Number(inserted.rows[0].id);
      await this.enqueueTrigger(client, {
        organizationId,
        contactId,
        triggerType: 'contact_added',
        eventKey: `domain:contact_added:${contactId}`,
        payload: { source: values.source },
      });
      await client.query(
        `INSERT INTO contact_activities (contact_id, user_id, type, title, content)
         VALUES (
           $1, $2, 'system', 'Contact Created',
           jsonb_build_object(
             'action', 'created',
             'by', (SELECT COALESCE(name, email) FROM users WHERE id = $2)
           )
         )`,
        [contactId, userId],
      );
      const row = await this.findByIdWithClient(client, organizationId, contactId);
      if (!row) throw new Error('Created contact could not be reloaded');
      return { kind: 'created', row };
    });
  }

  async update(
    organizationId: number,
    userId: number,
    contactId: number,
    values: ContactUpdateValues,
  ): Promise<UpdateContactOutcome> {
    return this.transaction(async (client) => {
      const existingResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM contacts
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, contactId],
      );
      const existing = existingResult.rows[0];
      if (!existing) return { kind: 'not_found' };
      if (
        Object.prototype.hasOwnProperty.call(values, 'assignedToId') &&
        !(await this.isMember(client, organizationId, values.assignedToId ?? null))
      ) {
        return { kind: 'invalid_assignee' };
      }

      const columns: Record<keyof ContactUpdateValues, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        email: 'email',
        phone: 'phone',
        company: 'company',
        jobTitle: 'job_title',
        address: 'address',
        source: 'source',
        status: 'status',
        customFields: 'custom_fields',
        tags: 'tags',
        assignedToId: 'assigned_to',
      };
      const entries = Object.entries(values) as [keyof ContactUpdateValues, unknown][];
      const parameters: unknown[] = [];
      const assignments = entries.map(([field, value]) => {
        parameters.push(value);
        const cast = field === 'address' || field === 'customFields'
          ? '::jsonb'
          : field === 'tags'
            ? '::text[]'
            : '';
        return `${columns[field]} = $${parameters.length}${cast}`;
      });
      parameters.push(contactId, organizationId);
      await client.query(
        `UPDATE contacts SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${parameters.length - 1} AND organization_id = $${parameters.length}`,
        parameters,
      );
      const updatedResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM contacts WHERE organization_id = $1 AND id = $2',
        [organizationId, contactId],
      );
      const updated = updatedResult.rows[0];
      const changedFields = entries
        .map(([field]) => columns[field])
        .filter((column) => this.comparable(existing[column]) !== this.comparable(updated[column]));

      if (changedFields.length > 0) {
        await this.enqueueTrigger(client, {
          organizationId,
          contactId,
          triggerType: 'contact_updated',
          eventKey: `domain:${randomUUID()}`,
          payload: {
            changed_fields: changedFields,
            previous_source: existing.source,
            previous_status: existing.status,
            source: updated.source,
            status: updated.status,
          },
        });
      }
      if (changedFields.includes('status')) {
        await client.query(
          `INSERT INTO contact_activities (contact_id, user_id, type, title, content)
           VALUES ($1, $2, 'status_change', 'Status Changed', $3::jsonb)`,
          [
            contactId,
            userId,
            JSON.stringify({ from: existing.status, to: updated.status }),
          ],
        );
      }
      const row = await this.findByIdWithClient(client, organizationId, contactId);
      if (!row) throw new Error('Updated contact could not be reloaded');
      return { kind: 'updated', row, changedFields };
    });
  }

  async delete(organizationId: number, contactId: number): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        'DELETE FROM contacts WHERE organization_id = $1 AND id = $2 RETURNING id',
        [organizationId, contactId],
      );
      return result.rowCount === 1;
    });
  }

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findByIdWithClient(
    client: PoolClient,
    organizationId: number,
    contactId: number,
  ): Promise<ContactRow | null> {
    const result = await client.query<ContactRow>(
      `SELECT ${contactSelection}
       FROM contacts c
       LEFT JOIN organization_members om_assigned
         ON om_assigned.organization_id = c.organization_id
        AND om_assigned.user_id = c.assigned_to
       LEFT JOIN users u_assigned ON u_assigned.id = om_assigned.user_id
       LEFT JOIN organization_members om_created
         ON om_created.organization_id = c.organization_id
        AND om_created.user_id = c.created_by
       LEFT JOIN users u_created ON u_created.id = om_created.user_id
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, contactId],
    );
    return result.rows[0] ?? null;
  }

  private async isMember(
    client: PoolClient,
    organizationId: number,
    userId: number | null,
  ): Promise<boolean> {
    if (userId === null) return true;
    const result = await client.query(
      `SELECT 1 FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    return result.rowCount === 1;
  }

  private async enqueueTrigger(
    client: PoolClient,
    event: {
      organizationId: number;
      contactId: number;
      triggerType: string;
      eventKey: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO workflow_triggers (
         workflow_id, organization_id, contact_id, trigger_type,
         entity_type, entity_id, payload, status, event_key,
         source, occurred_at, next_attempt_at
       ) VALUES (
         NULL, $1, $2, $3, 'contact', $2, $4::jsonb, 'queued', $5,
         'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       ) ON CONFLICT DO NOTHING`,
      [
        event.organizationId,
        event.contactId,
        event.triggerType,
        JSON.stringify(event.payload),
        event.eventKey,
      ],
    );
  }

  private comparable(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private defaultLimit(plan: string): number {
    if (plan === 'unlimited') return 25_000;
    if (plan === 'pro') return Number.POSITIVE_INFINITY;
    return 5_000;
  }

  private whereClause(criteria: ContactCriteria): {
    where: string;
    parameters: unknown[];
  } {
    const clauses = ['c.organization_id = $1'];
    const parameters: unknown[] = [criteria.organizationId];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (criteria.search) {
      const placeholder = bind(`%${criteria.search}%`);
      clauses.push(`(
        c.first_name ILIKE ${placeholder} OR
        c.last_name ILIKE ${placeholder} OR
        c.email ILIKE ${placeholder} OR
        c.company ILIKE ${placeholder} OR
        c.phone ILIKE ${placeholder}
      )`);
    }
    if (criteria.status) {
      clauses.push(`c.status = ${bind(criteria.status)}`);
    }
    if (criteria.tags?.length) {
      clauses.push(`c.tags && ${bind(criteria.tags)}::text[]`);
    }
    if (criteria.assignedToId !== undefined) {
      clauses.push(`c.assigned_to = ${bind(criteria.assignedToId)}`);
    }

    return { where: `WHERE ${clauses.join(' AND ')}`, parameters };
  }
}
