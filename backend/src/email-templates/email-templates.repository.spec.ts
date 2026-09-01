import type { Pool, PoolClient } from 'pg';
import {
  EmailTemplatePublishIdempotencyConflictError,
  EmailTemplatesRepository,
} from './email-templates.repository';

describe('EmailTemplatesRepository publish receipts', () => {
  it('publishes once, replays the receipt, and rejects changed key reuse', async () => {
    let hasDraft = true;
    let receipt: {
      request_fingerprint: string;
      published_version_id: number | null;
    } | null = null;
    let publishWrites = 0;
    const published = {
      id: 9,
      organization_id: 4,
      name: 'Welcome',
      subject: 'Published subject',
      preheader: null,
      body_html: '<p>Published</p>',
      body_text: null,
      variables: [],
      category: 'general',
      is_active: true,
      created_by: 7,
      created_by_name: 'Owner',
      created_at: new Date(),
      updated_at: new Date(),
      draft_version_id: null,
      published_version_id: 20,
      draft_version: null,
      published_version: 1,
    };
    const query = jest.fn().mockImplementation(
      async (sqlValue: string, params: unknown[] = []) => {
        const sql = String(sqlValue);
        if (sql.includes('SELECT draft_version_id,published_version_id,is_active')) {
          return {
            rows: [{
              draft_version_id: hasDraft ? 20 : null,
              published_version_id: hasDraft ? null : 20,
              is_active: true,
            }],
          };
        }
        if (sql.includes('SELECT request_fingerprint,published_version_id')) {
          return { rows: receipt ? [receipt] : [] };
        }
        if (sql.includes('INSERT INTO email_template_publish_receipts')) {
          receipt = {
            request_fingerprint: String(params[3]),
            published_version_id: null,
          };
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("FROM email_template_versions WHERE id=$1") &&
          sql.includes("state='draft'")) {
          return {
            rows: [{
              id: 20,
              subject: 'Published subject',
              preheader: null,
              body_html: '<p>Published</p>',
              body_text: null,
              variables: [],
              is_active: true,
            }],
          };
        }
        if (sql.includes("UPDATE email_template_versions SET state='published'")) {
          publishWrites += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE email_templates SET subject=')) {
          hasDraft = false;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE email_template_publish_receipts')) {
          if (receipt) receipt.published_version_id = Number(params[3]);
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM email_templates et')) {
          return { rows: [published] };
        }
        return { rows: [], rowCount: 1 };
      },
    );
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const repository = new EmailTemplatesRepository(pool);

    await expect(repository.publishDraft(
      4,
      9,
      7,
      'publish-attempt-9',
      true,
    )).resolves.toMatchObject({ published_version_id: 20 });
    await expect(repository.publishDraft(
      4,
      9,
      7,
      'publish-attempt-9',
      true,
    )).resolves.toMatchObject({ published_version_id: 20 });
    await expect(repository.publishDraft(
      4,
      9,
      7,
      'publish-attempt-9',
      false,
    )).rejects.toBeInstanceOf(EmailTemplatePublishIdempotencyConflictError);
    expect(publishWrites).toBe(1);
  });
});
