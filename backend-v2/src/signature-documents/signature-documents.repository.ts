import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SignatureDocumentStatus } from './signature-document.enums';

export type SignatureDocumentRow = {
  id: number; organization_id: number; title: string; document_number: string | null;
  description: string | null; message: string | null; status: SignatureDocumentStatus;
  recipient_count: number | string; routing_mode: string; template_id: number | null;
  expiration_days: number; expires_at: Date | null; sender_name: string | null;
  sender_email: string | null; created_by: number | null; sent_at: Date | null;
  completed_at: Date | null; has_file: boolean; has_signed_file: boolean;
  file_name: string | null; file_type: string | null; file_size: number | string | null;
  created_at: Date; updated_at: Date;
};

export type SignatureRecipientRow = {
  id: number; document_id: number; organization_id: number; contact_id: number | null;
  name: string | null; email: string; signing_order: number; role_name: string | null;
  routing_status: string; status: string; sent_at: Date | null; viewed_at: Date | null;
  signed_at: Date | null; declined_at: Date | null; decline_reason: string | null;
  identity_method: string; identity_verified_at: Date | null;
};

export type SignatureFieldRow = {
  id: number; document_id: number; recipient_id: number | null; role_name: string | null;
  field_type: string; page_number: number; x_position: number | string; y_position: number | string;
  width: number | string; height: number | string; label: string | null; is_required: boolean;
  value: string | null; font_size: number | null; font_family: string | null;
  text_align: string | null; locked: boolean;
};

export type SignatureAuditRow = {
  id: number; document_id: number; recipient_id: number | null; event_type: string;
  description: string | null; created_at: Date;
};

const documentColumns = `d.id, d.organization_id, d.title, d.document_number,
  d.description, d.message, d.status, d.routing_mode, d.template_id,
  d.expiration_days, d.expires_at, d.sender_name, d.sender_email, d.created_by,
  d.sent_at, d.completed_at, d.file_url IS NOT NULL AS has_file,
  d.signed_file_url IS NOT NULL AS has_signed_file, d.file_name, d.file_type,
  d.file_size, d.created_at, d.updated_at`;

@Injectable()
export class SignatureDocumentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id = $1', [organizationId],
    );
    const organization = result.rows[0];
    return organization !== undefined
      && ['starter', 'unlimited', 'pro'].includes(organization.plan ?? 'starter');
  }

  async findPage(input: { organizationId: number; status?: SignatureDocumentStatus; pageSize: number; offset: number }): Promise<{ rows: SignatureDocumentRow[]; total: number }> {
    return this.snapshot(async (client) => {
      const params: unknown[] = [input.organizationId];
      const conditions = ['d.organization_id = $1'];
      if (input.status !== undefined) { params.push(input.status); conditions.push(`d.status = $${params.length}`); }
      const where = conditions.join(' AND ');
      const count = await client.query<{ total: string }>(`SELECT COUNT(*) AS total FROM signature_documents d WHERE ${where}`, params);
      params.push(input.pageSize, input.offset);
      const rows = await client.query<SignatureDocumentRow>(
        `SELECT ${documentColumns},
           (SELECT COUNT(*)::int FROM signature_recipients r
            WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count
         FROM signature_documents d
         WHERE ${where}
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
      );
      return { rows: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  async findDetail(organizationId: number, id: number): Promise<{ document: SignatureDocumentRow; recipients: SignatureRecipientRow[]; fields: SignatureFieldRow[]; audit: SignatureAuditRow[] } | null> {
    return this.snapshot(async (client) => {
      const document = await client.query<SignatureDocumentRow>(
        `SELECT ${documentColumns},
           (SELECT COUNT(*)::int FROM signature_recipients r
            WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count
         FROM signature_documents d WHERE d.id=$1 AND d.organization_id=$2`, [id, organizationId],
      );
      if (!document.rows[0]) return null;
      const recipients = await client.query<SignatureRecipientRow>(
        `SELECT r.id,r.document_id,r.organization_id,r.contact_id,r.name,r.email,r.signing_order,
           r.role_name,r.routing_status,r.status,r.sent_at,r.viewed_at,r.signed_at,r.declined_at,
           r.decline_reason,r.identity_method,r.identity_verified_at
         FROM signature_recipients r WHERE r.document_id=$1 AND r.organization_id=$2
         ORDER BY r.signing_order ASC, r.id ASC`, [id, organizationId],
      );
      const fields = await client.query<SignatureFieldRow>(
        `SELECT f.id,f.document_id,f.recipient_id,f.role_name,f.field_type,f.page_number,
           f.x_position,f.y_position,f.width,f.height,f.label,f.is_required,f.value,
           f.font_size,f.font_family,f.text_align,f.locked
         FROM signature_fields f JOIN signature_documents d ON d.id=f.document_id
         WHERE f.document_id=$1 AND d.organization_id=$2 ORDER BY f.id ASC`, [id, organizationId],
      );
      const audit = await client.query<SignatureAuditRow>(
        `SELECT a.id,a.document_id,a.recipient_id,a.event_type,a.description,a.created_at
         FROM signature_audit_log a JOIN signature_documents d ON d.id=a.document_id
         WHERE a.document_id=$1 AND d.organization_id=$2 ORDER BY a.created_at ASC,a.id ASC`, [id, organizationId],
      );
      return { document: document.rows[0], recipients: recipients.rows, fields: fields.rows, audit: audit.rows };
    });
  }

  async findAudit(organizationId: number, id: number): Promise<SignatureAuditRow[] | null> {
    return this.snapshot(async (client) => {
      const exists = await client.query(
        'SELECT id FROM signature_documents WHERE id=$1 AND organization_id=$2',
        [id, organizationId],
      );
      if (!exists.rows[0]) return null;
      const result = await client.query<SignatureAuditRow>(
        `SELECT a.id,a.document_id,a.recipient_id,a.event_type,a.description,a.created_at
         FROM signature_audit_log a
         JOIN signature_documents d ON d.id=a.document_id
         WHERE a.document_id=$1 AND d.organization_id=$2
         ORDER BY a.created_at ASC,a.id ASC`,
        [id, organizationId],
      );
      return result.rows;
    });
  }

  private async snapshot<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
