import type { Pool, PoolClient } from 'pg';
import { PublicFormsRepository } from './public-forms.repository';

describe('PublicFormsRepository submission idempotency', () => {
  it('replays the same payload and rejects key reuse for different data', async () => {
    let storedFingerprint: string | null = null;
    let submissionInserts = 0;
    let triggerInserts = 0;
    const form = {
      id: 12,
      organization_id: 4,
      name: 'Contact',
      slug: 'contact',
      success_message: 'Thanks',
      redirect_url: null,
      notify_on_submit: false,
      notification_emails: null,
      create_contact: false,
      contact_tags: null,
    };
    const query = jest.fn().mockImplementation(
      async (sqlValue: string, params: unknown[] = []) => {
        const sql = String(sqlValue);
        if (sql.includes('FROM forms f') && sql.includes('f.public_id')) {
          return { rows: [form] };
        }
        if (sql.includes('FROM form_fields')) return { rows: [] };
        if (sql.includes('SELECT request_fingerprint')) {
          return {
            rows: storedFingerprint
              ? [{ request_fingerprint: storedFingerprint }]
              : [],
          };
        }
        if (sql.includes('INSERT INTO form_submissions')) {
          submissionInserts += 1;
          storedFingerprint = String(params[8]);
          expect(params[7]).toBe('public-form-attempt-1');
          expect(storedFingerprint).toMatch(/^[a-f0-9]{64}$/);
          return {
            rows: [{ id: 90, contact_id: null, created_at: new Date() }],
          };
        }
        if (sql.includes('INSERT INTO workflow_triggers')) {
          triggerInserts += 1;
        }
        return { rows: [], rowCount: 1 };
      },
    );
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const repository = new PublicFormsRepository(pool);
    const context = { ipAddress: null, userAgent: null, referrer: null };

    await expect(repository.submitPublicForm(
      'frm_12',
      context,
      () => ({ answer: 'Same' }),
      'public-form-attempt-1',
    )).resolves.toMatchObject({ status: 'ok' });
    await expect(repository.submitPublicForm(
      'frm_12',
      context,
      () => ({ answer: 'Same' }),
      'public-form-attempt-1',
    )).resolves.toMatchObject({ status: 'ok' });
    await expect(repository.submitPublicForm(
      'frm_12',
      context,
      () => ({ answer: 'Changed' }),
      'public-form-attempt-1',
    )).resolves.toEqual({ status: 'idempotency_conflict' });

    expect(submissionInserts).toBe(1);
    expect(triggerInserts).toBe(1);
  });
});
