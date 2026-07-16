import { Inject, Injectable } from '@nestjs/common';
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
