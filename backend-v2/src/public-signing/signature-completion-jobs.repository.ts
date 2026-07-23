import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { workflowJobBackoffMs } from '../workflow-jobs/workflow-job.util';

export type SignatureCompletionClaim = {
  id: number;
  idempotency_key: string;
  organization_id: number;
  document_id: number;
  attempt_count: number;
};

export type SignatureCompletionSnapshot = {
  document: {
    id: number;
    organization_id: number;
    title: string;
    document_number: string | null;
    file_url: string;
    file_name: string | null;
    original_sha256: string | null;
    signed_file_url: string | null;
  };
  fields: Array<{
    id: number;
    field_type: string;
    page_number: number;
    x_position: string;
    y_position: string;
    width: string;
    height: string;
    value: string | null;
    font_size: number | null;
  }>;
  recipients: Array<{
    id: number;
    contact_id: number | null;
    name: string | null;
    email: string;
    signed_at: Date | null;
  }>;
  audit: Array<{
    event_type: string;
    description: string | null;
    created_at: Date;
  }>;
  sender: { name: string | null; email: string | null };
};

const redactedError = (error: unknown): string =>
  String(error instanceof Error ? error.message : error || 'Signature completion failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|Bearer)\S+\b/gi, '[redacted-secret]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);

@Injectable()
export class SignatureCompletionJobsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  claim(
    leaseSeconds: number,
    jobId: number | null = null,
  ): Promise<SignatureCompletionClaim | null> {
    return this.transaction(async (client) => {
      await client.query(
        `UPDATE signature_completion_jobs job
         SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
           cancellation_reason='document_not_completable',
           lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
         FROM signature_documents document
         WHERE job.document_id=document.id AND job.status IN ('queued','retry')
           AND (
             document.status NOT IN ('sent','in_progress')
             OR EXISTS (
               SELECT 1 FROM signature_recipients recipient
               WHERE recipient.document_id=document.id
                 AND recipient.status<>'signed'
             )
           )`,
      );
      const result = await client.query<SignatureCompletionClaim>(
        `WITH candidate AS (
           SELECT job.id
           FROM signature_completion_jobs job
           JOIN signature_documents document ON document.id=job.document_id
             AND document.organization_id=job.organization_id
           WHERE ($2::bigint IS NULL OR job.id=$2)
             AND job.cancelled_at IS NULL
             AND document.status='in_progress'
             AND NOT EXISTS (
               SELECT 1 FROM signature_recipients recipient
               WHERE recipient.document_id=document.id
                 AND recipient.status<>'signed'
             )
             AND (
               (job.status IN ('queued','retry')
                 AND job.next_attempt_at<=CURRENT_TIMESTAMP)
               OR (job.status='processing'
                 AND job.lease_expires_at<=CURRENT_TIMESTAMP)
             )
           ORDER BY job.next_attempt_at,job.created_at,job.id
           FOR UPDATE OF job SKIP LOCKED LIMIT 1
         )
         UPDATE signature_completion_jobs job
         SET status='processing',attempt_count=attempt_count+1,
           lease_expires_at=CURRENT_TIMESTAMP+($1::int*INTERVAL '1 second'),
           last_error=NULL,updated_at=CURRENT_TIMESTAMP
         FROM candidate
         WHERE job.id=candidate.id
         RETURNING job.*`,
        [leaseSeconds, jobId],
      );
      return result.rows[0] ?? null;
    });
  }

  async snapshot(
    claim: SignatureCompletionClaim,
  ): Promise<SignatureCompletionSnapshot | null> {
    const document = await this.pool.query<SignatureCompletionSnapshot['document'] & {
      sender_name: string | null;
      sender_email: string | null;
      created_by: number | null;
    }>(
      `SELECT id,organization_id,title,document_number,file_url,file_name,
         original_sha256,signed_file_url,sender_name,sender_email,created_by
       FROM signature_documents
       WHERE id=$1 AND organization_id=$2 AND status='in_progress'
         AND file_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM signature_recipients
           WHERE document_id=$1 AND status<>'signed'
         )`,
      [claim.document_id, claim.organization_id],
    );
    const row = document.rows[0];
    if (!row) return null;
    const [fields, recipients, audit, creator] = await Promise.all([
      this.pool.query<SignatureCompletionSnapshot['fields'][number]>(
        `SELECT id,field_type,page_number,x_position,y_position,width,height,
           value,font_size
         FROM signature_fields WHERE document_id=$1 ORDER BY page_number,id`,
        [claim.document_id],
      ),
      this.pool.query<SignatureCompletionSnapshot['recipients'][number]>(
        `SELECT id,contact_id,name,email,signed_at
         FROM signature_recipients
         WHERE document_id=$1 AND organization_id=$2
         ORDER BY signing_order,id`,
        [claim.document_id, claim.organization_id],
      ),
      this.pool.query<SignatureCompletionSnapshot['audit'][number]>(
        `SELECT event_type,description,created_at
         FROM signature_audit_log
         WHERE document_id=$1 ORDER BY created_at,id`,
        [claim.document_id],
      ),
      row.created_by
        ? this.pool.query<{ name: string | null; email: string | null }>(
          'SELECT name,email FROM users WHERE id=$1',
          [row.created_by],
        )
        : Promise.resolve({ rows: [] as Array<{ name: string | null; email: string | null }> }),
    ]);
    return {
      document: row,
      fields: fields.rows,
      recipients: recipients.rows,
      audit: audit.rows,
      sender: {
        name: row.sender_name || creator.rows[0]?.name || null,
        email: row.sender_email || creator.rows[0]?.email || null,
      },
    };
  }

  complete(
    claim: SignatureCompletionClaim,
    artifact: { fileUrl: string; sha256: string },
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const job = await client.query(
        `SELECT id FROM signature_completion_jobs
         WHERE id=$1 AND status='processing' AND attempt_count=$2
         FOR UPDATE`,
        [claim.id, claim.attempt_count],
      );
      if (!job.rows[0]) return false;
      const document = await client.query<{
        id: number;
        title: string;
        organization_id: number;
        signed_file_url: string | null;
        sender_name: string | null;
        sender_email: string | null;
        created_by: number | null;
      }>(
        `SELECT id,title,organization_id,signed_file_url,sender_name,sender_email,created_by
         FROM signature_documents
         WHERE id=$1 AND organization_id=$2 AND status='in_progress'
           AND NOT EXISTS (
             SELECT 1 FROM signature_recipients
             WHERE document_id=$1 AND status<>'signed'
           )
         FOR UPDATE`,
        [claim.document_id, claim.organization_id],
      );
      const row = document.rows[0];
      if (!row) {
        await client.query(
          `UPDATE signature_completion_jobs SET status='cancelled',
             cancelled_at=CURRENT_TIMESTAMP,
             cancellation_reason='document_not_completable',
             lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND attempt_count=$2`,
          [claim.id, claim.attempt_count],
        );
        return false;
      }
      await client.query(
        `UPDATE signature_documents SET status='completed',
           completed_at=CURRENT_TIMESTAMP,signed_file_url=$3,signed_sha256=$4,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [claim.document_id, claim.organization_id, artifact.fileUrl, artifact.sha256],
      );
      if (row.signed_file_url && row.signed_file_url !== artifact.fileUrl) {
        await client.query(
          `INSERT INTO signature_file_deletion_jobs
             (organization_id,document_id,file_url)
           VALUES ($1,$2,$3)
           ON CONFLICT (file_url) DO NOTHING`,
          [claim.organization_id, claim.document_id, row.signed_file_url],
        );
      }
      await client.query(
        `UPDATE signature_completion_jobs SET status='completed',
           completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,last_error=NULL,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND attempt_count=$2`,
        [claim.id, claim.attempt_count],
      );
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,event_type,description,metadata,created_at)
         VALUES ($1,'completed','Signed PDF completed',
           $2::jsonb,CURRENT_TIMESTAMP)`,
        [
          claim.document_id,
          JSON.stringify({
            actor_class: 'system',
            completion_job_id: claim.id,
            signed_sha256: artifact.sha256,
            version: 1,
          }),
        ],
      );
      await this.enqueueContractSigned(client, row);
      await this.enqueueCompletionNotices(client, row);
      return true;
    });
  }

  async fail(
    claim: SignatureCompletionClaim,
    error: unknown,
    options: {
      maxAttempts: number;
      baseDelayMs: number;
      maximumDelayMs: number;
      retryable?: boolean;
    },
  ): Promise<'dead_letter' | 'retry' | 'stale'> {
    const status = options.retryable === false || claim.attempt_count >= options.maxAttempts
      ? 'dead_letter'
      : 'retry';
    const delay = workflowJobBackoffMs(
      claim.attempt_count,
      options.baseDelayMs,
      options.maximumDelayMs,
    );
    const result = await this.pool.query<{ status: 'dead_letter' | 'retry' }>(
      `UPDATE signature_completion_jobs SET status=$3::varchar,
         next_attempt_at=CASE WHEN $3::varchar='retry'
           THEN CURRENT_TIMESTAMP+($4::bigint*INTERVAL '1 millisecond')
           ELSE next_attempt_at END,
         lease_expires_at=NULL,last_error=$5,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='processing' AND attempt_count=$2
       RETURNING status`,
      [claim.id, claim.attempt_count, status, delay, redactedError(error)],
    );
    return result.rows[0]?.status ?? 'stale';
  }

  private async enqueueContractSigned(
    client: PoolClient,
    document: { id: number; title: string; organization_id: number },
  ): Promise<void> {
    await client.query(
      `INSERT INTO workflow_triggers (
         workflow_id,organization_id,contact_id,trigger_type,entity_type,
         entity_id,payload,status,event_key,source,occurred_at,next_attempt_at
       )
       SELECT NULL,$2,recipient.contact_id,'contract_signed',
         'signature_document',$1,
         jsonb_build_object(
           'completed_at',CURRENT_TIMESTAMP,
           'document_id',$1,
           'document_title',$3::text
         ),
         'queued',
         'domain:contract_signed:' || $1 || ':contact:' || recipient.contact_id,
         'domain',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       FROM (
         SELECT DISTINCT contact_id
         FROM signature_recipients
         WHERE document_id=$1 AND contact_id IS NOT NULL
       ) recipient
       ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
      [document.id, document.organization_id, document.title],
    );
  }

  private async enqueueCompletionNotices(
    client: PoolClient,
    document: {
      id: number;
      title: string;
      organization_id: number;
      sender_name: string | null;
      sender_email: string | null;
      created_by: number | null;
    },
  ): Promise<void> {
    let senderName = document.sender_name;
    let senderEmail = document.sender_email;
    if ((!senderName || !senderEmail) && document.created_by) {
      const creator = await client.query<{ name: string | null; email: string | null }>(
        'SELECT name,email FROM users WHERE id=$1',
        [document.created_by],
      );
      senderName ||= creator.rows[0]?.name || null;
      senderEmail ||= creator.rows[0]?.email || null;
    }
    const recipients = await client.query<{
      id: number;
      name: string | null;
      email: string;
    }>(
      `SELECT id,name,email FROM signature_recipients
       WHERE document_id=$1 AND organization_id=$2 ORDER BY id`,
      [document.id, document.organization_id],
    );
    const notices = [
      ...(senderEmail
        ? [{
          key: `signature-document-completed-sender-v1-${document.id}`,
          recipientId: null,
          to: senderEmail,
          name: senderName,
        }]
        : []),
      ...recipients.rows.map((recipient) => ({
        key: `signature-document-completed-recipient-v1-${document.id}-${recipient.id}`,
        recipientId: recipient.id,
        to: recipient.email,
        name: recipient.name,
      })),
    ];
    for (const notice of notices) {
      await client.query(
        `INSERT INTO signature_delivery_outbox
           (idempotency_key,organization_id,document_id,recipient_id,
            delivery_type,payload)
         VALUES ($1,$2,$3,$4,'document_completed',$5::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          notice.key,
          document.organization_id,
          document.id,
          notice.recipientId,
          JSON.stringify({
            to: notice.to,
            recipientName: notice.name,
            documentTitle: document.title,
            senderName,
            senderEmail,
            message: null,
            expiresAt: null,
          }),
        ],
      );
    }
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
