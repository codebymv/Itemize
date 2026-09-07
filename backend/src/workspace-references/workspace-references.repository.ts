import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  MONEY_ENTITY_TYPES,
  referenceKey,
  type MentionToken,
  type ReferenceEntityType,
} from '../workspace-content/mention-tokens';
import type {
  MoneyDocumentSuggestion,
  WorkspaceReference,
  WorkspaceReferenceSource,
} from './workspace-references.types';

export type ReferenceSourceType = 'list' | 'note' | 'whiteboard' | 'wireframe';

export interface ReferenceSource {
  sourceType: ReferenceSourceType;
  sourceId: number;
}

const SOURCE_TABLES: Record<ReferenceSourceType, string> = {
  list: 'lists',
  note: 'notes',
  whiteboard: 'whiteboards',
  wireframe: 'wireframes',
};

const MONEY_TABLES: Record<Exclude<ReferenceEntityType, 'contact'>, string> = {
  invoice: 'invoices',
  estimate: 'estimates',
  payment: 'payments',
};

type HydratedRow = {
  source_type: ReferenceSourceType;
  source_id: number;
  entity_type: ReferenceEntityType;
  entity_id: number;
  label: string;
  contact_name: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_total: string | null;
  invoice_currency: string | null;
  invoice_sent_at: Date | null;
  invoice_viewed_at: Date | null;
  invoice_paid_at: Date | null;
  estimate_number: string | null;
  estimate_status: string | null;
  estimate_total: string | null;
  estimate_currency: string | null;
  estimate_sent_at: Date | null;
  estimate_viewed_at: Date | null;
  estimate_accepted_at: Date | null;
  estimate_declined_at: Date | null;
  payment_amount: string | null;
  payment_status: string | null;
  payment_currency: string | null;
  payment_paid_at: Date | null;
  payment_invoice_number: string | null;
};

const MEMBERSHIP_JOIN = (alias: string) =>
  `JOIN organization_members membership
     ON membership.organization_id = ${alias}.organization_id
    AND membership.user_id = $1`;

@Injectable()
export class WorkspaceReferencesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The subset of references the owner may make right now: contacts and money
   * documents in organizations the user currently belongs to, re-read from
   * PostgreSQL on every save. The browser's selected organization is not
   * consulted.
   */
  async allowedReferences(
    client: PoolClient,
    userId: number,
    tokens: MentionToken[],
  ): Promise<Set<string>> {
    const allowed = new Set<string>();
    const byType = new Map<ReferenceEntityType, number[]>();
    for (const token of tokens) {
      const ids = byType.get(token.entityType) ?? [];
      if (!ids.includes(token.entityId)) ids.push(token.entityId);
      byType.set(token.entityType, ids);
    }
    for (const [entityType, ids] of byType) {
      const table = entityType === 'contact' ? 'contacts' : MONEY_TABLES[entityType];
      const result = await client.query<{ id: number }>(
        `SELECT entity.id
           FROM ${table} entity
           ${MEMBERSHIP_JOIN('entity')}
          WHERE entity.id = ANY($2::int[])`,
        [userId, ids],
      );
      for (const row of result.rows) allowed.add(referenceKey(entityType, row.id));
    }
    return allowed;
  }

  /** Drops every reference a deleted card held, inside the caller's delete transaction. */
  async removeForSource(client: PoolClient, source: ReferenceSource): Promise<void> {
    await client.query(
      'DELETE FROM workspace_references WHERE source_type = $1 AND source_id = $2',
      [source.sourceType, source.sourceId],
    );
  }

  /** Makes the stored references for a card equal to `tokens`, inside the caller's transaction. */
  async replaceForSource(
    client: PoolClient,
    userId: number,
    source: ReferenceSource,
    tokens: MentionToken[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM workspace_references
        WHERE source_type = $1 AND source_id = $2`,
      [source.sourceType, source.sourceId],
    );
    if (tokens.length === 0) return;
    const values: unknown[] = [userId, source.sourceType, source.sourceId];
    const rows = tokens.map((token) => {
      values.push(token.entityType, token.entityId, token.label.slice(0, 200));
      const base = values.length;
      return `($1, $2, $3, $${base - 2}, $${base - 1}, $${base})`;
    });
    await client.query(
      `INSERT INTO workspace_references
         (user_id, source_type, source_id, entity_type, entity_id, label)
       VALUES ${rows.join(', ')}
       ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING`,
      values,
    );
  }

  /**
   * References for the owner's cards, hydrated with the entity's current
   * label and state. Rows whose entity the owner can no longer reach are
   * omitted, which is how a pill degrades to plain text.
   */
  async hydrateForSources(
    userId: number,
    sources: ReferenceSource[],
  ): Promise<Map<string, WorkspaceReference[]>> {
    const hydrated = new Map<string, WorkspaceReference[]>();
    if (sources.length === 0) return hydrated;
    const result = await this.pool.query<HydratedRow>(
      `SELECT reference.source_type, reference.source_id, reference.entity_type,
              reference.entity_id, reference.label,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', contact.first_name, contact.last_name)), ''),
                contact.company, contact.email
              ) AS contact_name,
              invoice.invoice_number, invoice.status AS invoice_status,
              invoice.total::text AS invoice_total, invoice.currency AS invoice_currency,
              invoice.sent_at AS invoice_sent_at, invoice.viewed_at AS invoice_viewed_at,
              invoice.paid_at AS invoice_paid_at,
              estimate.estimate_number, estimate.status AS estimate_status,
              estimate.total::text AS estimate_total, estimate.currency AS estimate_currency,
              estimate.sent_at AS estimate_sent_at, estimate.viewed_at AS estimate_viewed_at,
              estimate.accepted_at AS estimate_accepted_at,
              estimate.declined_at AS estimate_declined_at,
              payment.amount::text AS payment_amount, payment.status AS payment_status,
              payment.currency AS payment_currency, payment.paid_at AS payment_paid_at,
              payment_invoice.invoice_number AS payment_invoice_number
         FROM workspace_references reference
         LEFT JOIN contacts contact
                ON reference.entity_type = 'contact' AND contact.id = reference.entity_id
         LEFT JOIN invoices invoice
                ON reference.entity_type = 'invoice' AND invoice.id = reference.entity_id
         LEFT JOIN estimates estimate
                ON reference.entity_type = 'estimate' AND estimate.id = reference.entity_id
         LEFT JOIN payments payment
                ON reference.entity_type = 'payment' AND payment.id = reference.entity_id
         LEFT JOIN invoices payment_invoice ON payment_invoice.id = payment.invoice_id
         JOIN organization_members membership
           ON membership.user_id = $1
          AND membership.organization_id = COALESCE(
                contact.organization_id, invoice.organization_id,
                estimate.organization_id, payment.organization_id
              )
        WHERE reference.user_id = $1
          AND (reference.source_type, reference.source_id) IN (
            SELECT source_type, source_id
              FROM UNNEST($2::text[], $3::int[]) AS pairs(source_type, source_id)
          )
        ORDER BY reference.id`,
      [userId, sources.map((s) => s.sourceType), sources.map((s) => s.sourceId)],
    );
    for (const row of result.rows) {
      const key = `${row.source_type}:${row.source_id}`;
      const list = hydrated.get(key) ?? [];
      list.push(this.hydrate(row));
      hydrated.set(key, list);
    }
    return hydrated;
  }

  /** The owner's cards that reference an entity, for the entity page. */
  async referencesTo(
    userId: number,
    entityType: ReferenceEntityType,
    entityId: number,
  ): Promise<WorkspaceReferenceSource[]> {
    const branches = (Object.keys(SOURCE_TABLES) as ReferenceSourceType[]).map((sourceType) =>
      `SELECT '${sourceType}'::text AS source_type, source.id AS source_id,
              source.title, source.updated_at
         FROM workspace_references reference
         JOIN ${SOURCE_TABLES[sourceType]} source
           ON source.id = reference.source_id AND source.user_id = reference.user_id
        WHERE reference.user_id = $1
          AND reference.source_type = '${sourceType}'
          AND reference.entity_type = $2
          AND reference.entity_id = $3`,
    );
    const result = await this.pool.query<{
      source_type: ReferenceSourceType;
      source_id: number;
      title: string | null;
      updated_at: Date;
    }>(`${branches.join(' UNION ALL ')} ORDER BY updated_at DESC, source_id DESC LIMIT 50`, [
      userId,
      entityType,
      entityId,
    ]);
    return result.rows.map((row) => ({
      sourceType: row.source_type,
      sourceId: Number(row.source_id),
      title: row.title ?? '',
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Rows for the `$` list: invoices, estimates, and payments the organization
   * owns, the bound client's documents first, newest first within that.
   */
  async suggestMoneyDocuments(
    organizationId: number,
    query: string,
    contactId: number | null,
    limit: number,
  ): Promise<MoneyDocumentSuggestion[]> {
    const search = `%${query.trim()}%`;
    const result = await this.pool.query<{
      entity_type: ReferenceEntityType;
      entity_id: number;
      label: string;
      detail: string | null;
      status: string | null;
      total: string | null;
      currency: string | null;
      contact_id: number | null;
      created_at: Date;
    }>(
      `SELECT * FROM (
         SELECT 'invoice'::text AS entity_type, id AS entity_id,
                invoice_number AS label, customer_name AS detail, status,
                total::text AS total, currency, contact_id, created_at
           FROM invoices
          WHERE organization_id = $1
            AND ($2 = '%%' OR invoice_number ILIKE $2 OR customer_name ILIKE $2 OR status ILIKE $2)
         UNION ALL
         SELECT 'estimate'::text, id, estimate_number, customer_name, status,
                total::text, currency, contact_id, created_at
           FROM estimates
          WHERE organization_id = $1
            AND ($2 = '%%' OR estimate_number ILIKE $2 OR customer_name ILIKE $2 OR status ILIKE $2)
         UNION ALL
         SELECT 'payment'::text, payment.id,
                CONCAT('Payment on ', COALESCE(invoice.invoice_number, '#' || payment.invoice_id::text)),
                NULL::text, payment.status, payment.amount::text, payment.currency,
                payment.contact_id, payment.created_at
           FROM payments payment
           LEFT JOIN invoices invoice ON invoice.id = payment.invoice_id
          WHERE payment.organization_id = $1
            AND ($2 = '%%' OR invoice.invoice_number ILIKE $2 OR payment.status ILIKE $2)
       ) documents
       ORDER BY (contact_id IS NOT NULL AND contact_id = $3) DESC, created_at DESC
       LIMIT $4`,
      [organizationId, search, contactId, limit],
    );
    return result.rows.map((row) => ({
      entityType: row.entity_type,
      entityId: Number(row.entity_id),
      label: row.label,
      detail: row.detail,
      status: row.status,
      total: row.total,
      currency: row.currency,
      contactId: row.contact_id === null ? null : Number(row.contact_id),
    }));
  }

  private hydrate(row: HydratedRow): WorkspaceReference {
    const base = {
      entityType: row.entity_type,
      entityId: Number(row.entity_id),
      status: null as string | null,
      total: null as string | null,
      currency: null as string | null,
      sentAt: null as Date | null,
      viewedAt: null as Date | null,
      paidAt: null as Date | null,
      acceptedAt: null as Date | null,
      declinedAt: null as Date | null,
    };
    switch (row.entity_type) {
      case 'contact':
        return { ...base, label: row.contact_name ?? row.label };
      case 'invoice':
        return {
          ...base,
          label: row.invoice_number ?? row.label,
          status: row.invoice_status,
          total: row.invoice_total,
          currency: row.invoice_currency,
          sentAt: row.invoice_sent_at,
          viewedAt: row.invoice_viewed_at,
          paidAt: row.invoice_paid_at,
        };
      case 'estimate':
        return {
          ...base,
          label: row.estimate_number ?? row.label,
          status: row.estimate_status,
          total: row.estimate_total,
          currency: row.estimate_currency,
          sentAt: row.estimate_sent_at,
          viewedAt: row.estimate_viewed_at,
          acceptedAt: row.estimate_accepted_at,
          declinedAt: row.estimate_declined_at,
        };
      default:
        return {
          ...base,
          label: row.payment_invoice_number
            ? `Payment on ${row.payment_invoice_number}`
            : row.label,
          status: row.payment_status,
          total: row.payment_amount,
          currency: row.payment_currency,
          paidAt: row.payment_paid_at,
        };
    }
  }
}

export const isMoneyEntity = (entityType: string): boolean =>
  (MONEY_ENTITY_TYPES as readonly string[]).includes(entityType);
