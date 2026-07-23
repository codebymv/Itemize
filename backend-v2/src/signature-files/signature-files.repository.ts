import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../database/database.module';

export type SignatureDocumentFileRow = {
  id: number;
  organization_id: number;
  title: string;
  document_number: string | null;
  description: string | null;
  message: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  status: string;
  expiration_days: number;
  expires_at: Date | null;
  sender_name: string | null;
  sender_email: string | null;
  sent_at: Date | null;
  completed_at: Date | null;
  signed_file_url: string | null;
  timezone: string | null;
  locale: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  routing_mode: string;
  template_id: number | null;
};

export type SignatureTemplateFileRow = {
  id: number;
  organization_id: number;
  title: string;
  description: string | null;
  message: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};

const documentColumns = `id,organization_id,title,document_number,description,message,
  file_url,file_name,file_size,file_type,status,expiration_days,expires_at,sender_name,
  sender_email,sent_at,completed_at,signed_file_url,timezone,locale,created_by,created_at,
  updated_at,routing_mode,template_id`;
const templateColumns = `id,organization_id,title,description,message,file_url,file_name,
  file_size,file_type,created_by,created_at,updated_at`;

@Injectable()
export class SignatureFilesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id=$1',
      [organizationId],
    );
    return (
      result.rows[0] !== undefined &&
      ['starter', 'unlimited', 'pro'].includes(
        result.rows[0].plan ?? 'starter',
      )
    );
  }

  async canUploadDocument(
    organizationId: number,
    documentId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM signature_documents
       WHERE id=$1 AND organization_id=$2 AND status='draft'`,
      [documentId, organizationId],
    );
    return result.rowCount === 1;
  }

  async canUploadTemplate(
    organizationId: number,
    templateId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM signature_templates WHERE id=$1 AND organization_id=$2',
      [templateId, organizationId],
    );
    return result.rowCount === 1;
  }

  findDocument(
    organizationId: number,
    documentId: number,
  ): Promise<SignatureDocumentFileRow | null> {
    return this.one<SignatureDocumentFileRow>(
      `SELECT ${documentColumns} FROM signature_documents
       WHERE id=$1 AND organization_id=$2`,
      [documentId, organizationId],
    );
  }

  findTemplate(
    organizationId: number,
    templateId: number,
  ): Promise<SignatureTemplateFileRow | null> {
    return this.one<SignatureTemplateFileRow>(
      `SELECT ${templateColumns} FROM signature_templates
       WHERE id=$1 AND organization_id=$2`,
      [templateId, organizationId],
    );
  }

  replaceDocument(
    organizationId: number,
    documentId: number,
    file: { url: string; name: string; size: number; sha256: string },
  ): Promise<SignatureDocumentFileRow | null> {
    return this.transaction(async (client) => {
      const current = await client.query<{
        file_url: string | null;
        file_name: string | null;
        file_size: number | null;
        file_type: string | null;
        original_sha256: string | null;
        created_by: number | null;
      }>(
        `SELECT file_url,file_name,file_size,file_type,original_sha256,created_by
         FROM signature_documents
         WHERE id=$1 AND organization_id=$2 AND status='draft' FOR UPDATE`,
        [documentId, organizationId],
      );
      const prior = current.rows[0];
      if (!prior) return null;
      if (prior.file_url) {
        const represented = await client.query(
          `SELECT 1 FROM signature_document_versions
           WHERE document_id=$1 AND file_url=$2
             AND original_sha256 IS NOT DISTINCT FROM $3
           LIMIT 1`,
          [documentId, prior.file_url, prior.original_sha256],
        );
        if (!represented.rows[0]) {
          await this.appendDocumentVersion(client, documentId, {
            url: prior.file_url,
            name: prior.file_name ?? 'document.pdf',
            size: prior.file_size ?? 0,
            type: prior.file_type ?? 'application/pdf',
            sha256: prior.original_sha256,
            createdBy: prior.created_by,
          });
        }
      }
      const updated = await client.query<SignatureDocumentFileRow>(
        `UPDATE signature_documents SET
           file_url=$1,file_name=$2,file_size=$3,file_type='application/pdf',
           original_sha256=$4,updated_at=CURRENT_TIMESTAMP
         WHERE id=$5 AND organization_id=$6 AND status='draft'
         RETURNING ${documentColumns}`,
        [
          file.url,
          file.name,
          file.size,
          file.sha256,
          documentId,
          organizationId,
        ],
      );
      await this.appendDocumentVersion(client, documentId, {
        ...file,
        type: 'application/pdf',
        createdBy: prior.created_by,
      });
      return updated.rows[0] ?? null;
    });
  }

  replaceTemplate(
    organizationId: number,
    templateId: number,
    file: { url: string; name: string; size: number; sha256: string },
  ): Promise<SignatureTemplateFileRow | null> {
    return this.transaction(async (client) => {
      const current = await client.query<{ file_url: string | null }>(
        `SELECT file_url FROM signature_templates
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [templateId, organizationId],
      );
      if (!current.rows[0]) return null;
      await this.enqueueOld(
        client,
        organizationId,
        null,
        current.rows[0].file_url,
      );
      const updated = await client.query<SignatureTemplateFileRow>(
        `UPDATE signature_templates SET
           file_url=$1,file_name=$2,file_size=$3,file_type='application/pdf',
           original_sha256=$4,updated_at=CURRENT_TIMESTAMP
         WHERE id=$5 AND organization_id=$6
         RETURNING ${templateColumns}`,
        [
          file.url,
          file.name,
          file.size,
          file.sha256,
          templateId,
          organizationId,
        ],
      );
      return updated.rows[0] ?? null;
    });
  }

  private async enqueueOld(
    client: PoolClient,
    organizationId: number,
    documentId: number | null,
    fileUrl: string | null,
  ): Promise<void> {
    if (!fileUrl) return;
    await client.query(
      `INSERT INTO signature_file_deletion_jobs
         (organization_id,document_id,file_url)
       VALUES ($1,$2,$3)
       ON CONFLICT (organization_id,file_url) DO UPDATE SET
         document_id=EXCLUDED.document_id,
         status=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN 'queued' ELSE signature_file_deletion_jobs.status END,
         next_attempt_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
         deleted_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
         last_error=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.last_error END,
         updated_at=CURRENT_TIMESTAMP`,
      [organizationId, documentId, fileUrl],
    );
  }

  private async appendDocumentVersion(
    client: PoolClient,
    documentId: number,
    file: {
      url: string;
      name: string;
      size: number;
      type: string;
      sha256: string | null;
      createdBy: number | null;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO signature_document_versions (
         document_id,version_number,file_url,file_name,file_size,file_type,
         original_sha256,created_by,created_at
       )
       SELECT $1,COALESCE(MAX(version_number),0)+1,$2,$3,$4,$5,$6,$7,
         CURRENT_TIMESTAMP
       FROM signature_document_versions
       WHERE document_id=$1`,
      [
        documentId,
        file.url,
        file.name,
        file.size,
        file.type,
        file.sha256,
        file.createdBy,
      ],
    );
  }

  private async one<T extends QueryResultRow>(
    sql: string,
    parameters: unknown[],
  ): Promise<T | null> {
    const result = await this.pool.query<T>(sql, parameters);
    return result.rows[0] ?? null;
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
