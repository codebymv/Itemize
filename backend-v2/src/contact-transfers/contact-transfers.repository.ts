import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  ContactExportFilter,
  ContactExportRow,
  NormalizedImportContact,
} from './contact-transfer.contract';

export type ContactImportDatabaseResult =
  | { kind: 'imported'; imported: number; skipped: number }
  | {
      kind: 'limit';
      current: number;
      limit: number;
      attempted: number;
    };

@Injectable()
export class ContactTransfersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async exportRows(
    organizationId: number,
    filter: ContactExportFilter,
    limit: number,
  ): Promise<ContactExportRow[]> {
    const clauses = ['organization_id = $1'];
    const parameters: unknown[] = [organizationId];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    if (filter.status) clauses.push(`status = ${bind(filter.status)}`);
    if (filter.tags?.length) {
      clauses.push(`tags && ${bind(filter.tags)}::text[]`);
    }
    parameters.push(limit);

    const result = await this.pool.query<ContactExportRow>(
      `SELECT
         first_name, last_name, email, phone, company, job_title,
         address->>'street' AS street,
         address->>'city' AS city,
         address->>'state' AS state,
         address->>'zip' AS zip,
         address->>'country' AS country,
         status, source, array_to_string(tags, ';') AS tags, created_at
       FROM contacts
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT $${parameters.length}`,
      parameters,
    );
    return result.rows;
  }

  async importRows(
    organizationId: number,
    userId: number,
    contacts: NormalizedImportContact[],
    skipDuplicates: boolean,
  ): Promise<ContactImportDatabaseResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const filtered = await this.filterDuplicates(
        client,
        organizationId,
        contacts,
        skipDuplicates,
      );
      const organization = await client.query<{
        plan: string | null;
        contacts_limit: number | null;
      }>(
        'SELECT plan, contacts_limit FROM organizations WHERE id = $1',
        [organizationId],
      );
      const plan = organization.rows[0]?.plan ?? 'starter';
      const limit =
        organization.rows[0]?.contacts_limit ?? this.defaultLimit(plan);
      const count = await client.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1',
        [organizationId],
      );
      const current = count.rows[0]?.total ?? 0;
      if (limit !== -1 && current + filtered.contacts.length > limit) {
        await client.query('ROLLBACK');
        return {
          kind: 'limit',
          current,
          limit,
          attempted: filtered.contacts.length,
        };
      }

      const insertedIds: number[] = [];
      for (let start = 0; start < filtered.contacts.length; start += 500) {
        const batch = filtered.contacts.slice(start, start + 500);
        const values: unknown[] = [];
        const placeholders = batch.map((contact) => {
          const offset = values.length;
          values.push(
            organizationId,
            contact.firstName,
            contact.lastName,
            contact.email,
            contact.phone,
            contact.company,
            contact.jobTitle,
            JSON.stringify(contact.address),
            contact.status,
            contact.tags,
            userId,
          );
          return `(
            $${offset + 1}, $${offset + 2}, $${offset + 3},
            $${offset + 4}, $${offset + 5}, $${offset + 6},
            $${offset + 7}, $${offset + 8}::jsonb, 'import',
            $${offset + 9}, $${offset + 10}::text[], $${offset + 11}
          )`;
        });
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO contacts (
             organization_id, first_name, last_name, email, phone,
             company, job_title, address, source, status, tags, created_by
           ) VALUES ${placeholders.join(', ')}
           RETURNING id`,
          values,
        );
        insertedIds.push(...inserted.rows.map((row) => Number(row.id)));
      }

      await this.recordDomainEffects(
        client,
        organizationId,
        userId,
        insertedIds,
      );
      await client.query('COMMIT');
      return {
        kind: 'imported',
        imported: insertedIds.length,
        skipped: filtered.skipped,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async filterDuplicates(
    client: PoolClient,
    organizationId: number,
    contacts: NormalizedImportContact[],
    skipDuplicates: boolean,
  ): Promise<{ contacts: NormalizedImportContact[]; skipped: number }> {
    if (!skipDuplicates) return { contacts, skipped: 0 };
    const emails = contacts
      .map((contact) => contact.email)
      .filter((email): email is string => email !== null);
    const existing = emails.length
      ? await client.query<{ email: string }>(
          `SELECT DISTINCT email
           FROM contacts
           WHERE organization_id = $1 AND email = ANY($2::text[])`,
          [organizationId, emails],
        )
      : { rows: [] };
    const seen = new Set(existing.rows.map((row) => row.email));
    const accepted: NormalizedImportContact[] = [];
    let skipped = 0;
    for (const contact of contacts) {
      if (contact.email && seen.has(contact.email)) {
        skipped += 1;
        continue;
      }
      accepted.push(contact);
      if (contact.email) seen.add(contact.email);
    }
    return { contacts: accepted, skipped };
  }

  private async recordDomainEffects(
    client: PoolClient,
    organizationId: number,
    userId: number,
    contactIds: number[],
  ): Promise<void> {
    if (contactIds.length === 0) return;
    await client.query(
      `INSERT INTO workflow_triggers (
         workflow_id, organization_id, contact_id, trigger_type,
         entity_type, entity_id, payload, status, event_key,
         source, occurred_at, next_attempt_at
       )
       SELECT
         NULL, $1, contact_id, 'contact_added',
         'contact', contact_id, '{"source":"import"}'::jsonb, 'queued',
         'domain:contact_added:' || contact_id,
         'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM unnest($2::int[]) AS contact_id
       ON CONFLICT DO NOTHING`,
      [organizationId, contactIds],
    );
    await client.query(
      `INSERT INTO contact_activities (
         contact_id, user_id, type, title, content
       )
       SELECT
         contact_id, $1, 'system', 'Contact Created',
         jsonb_build_object(
           'action', 'created',
           'source', 'import',
           'by', (SELECT COALESCE(name, email) FROM users WHERE id = $1)
         )
       FROM unnest($2::int[]) AS contact_id`,
      [userId, contactIds],
    );
  }

  private defaultLimit(plan: string): number {
    if (plan === 'unlimited') return 25_000;
    if (plan === 'pro') return -1;
    return 5_000;
  }
}
