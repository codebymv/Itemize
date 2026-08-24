import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PublicFormField } from './public-form-contract';

export type PublicFormProjection = {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  type: string | null;
  submit_button_text: string | null;
  success_message: string | null;
  redirect_url: string | null;
  theme: unknown;
  organization_name: string;
};

export type SubmittableFormRow = {
  id: number;
  organization_id: number;
  name: string;
  slug: string | null;
  success_message: string | null;
  redirect_url: string | null;
  notify_on_submit: boolean;
  notification_emails: string[] | null;
  create_contact: boolean;
  contact_tags: string[] | null;
};

export type PublicFormFieldRow = PublicFormField & {
  field_order: number;
};

export type SubmitVisitContext = {
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

@Injectable()
export class PublicFormsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async publicForm(identifier: string): Promise<{
    form: PublicFormProjection;
    fields: PublicFormFieldRow[];
  } | null> {
    const client = await this.pool.connect();
    try {
      const form = await this.findPublishedForm<PublicFormProjection>(
        client,
        identifier,
        `f.id, f.name, f.description, f.slug, f.public_id, f.type,
         f.submit_button_text, f.success_message, f.redirect_url, f.theme,
         o.name as organization_name`,
      );
      if (!form) return null;
      return { form, fields: await this.formFields(client, form.id) };
    } finally {
      client.release();
    }
  }

  async submitPublicForm(
    identifier: string,
    context: SubmitVisitContext,
    validate: (
      fields: PublicFormFieldRow[],
    ) => Record<string, unknown>,
  ): Promise<
    | { status: 'not_found' }
    | { status: 'ok'; form: SubmittableFormRow }
  > {
    return this.transaction(async (client) => {
      const form = await this.findPublishedForm<SubmittableFormRow>(
        client,
        identifier,
        `f.id, f.organization_id, f.name, f.slug, f.success_message,
         f.redirect_url, f.notify_on_submit, f.notification_emails,
         f.create_contact, f.contact_tags, o.id as org_id`,
      );
      if (!form) return { status: 'not_found' };

      const fields = await this.formFields(client, form.id, true);
      const normalizedData = validate(fields);

      let contactId: number | null = null;
      if (form.create_contact) {
        const contactData: Record<string, unknown> = {};
        for (const field of fields) {
          const value = normalizedData[String(field.id)];
          if (field.map_to_contact_field && value !== undefined) {
            contactData[field.map_to_contact_field] = value;
          }
        }
        const normalizedEmail =
          contactData.email === null || contactData.email === undefined
            ? null
            : String(contactData.email).trim().toLowerCase() || null;
        if (normalizedEmail) {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('contact-email'), hashtext($1::text || ':' || $2))",
            [form.organization_id, normalizedEmail],
          );
          const existing = await client.query<{ id: number }>(
            `SELECT id
             FROM contacts
             WHERE organization_id = $1 AND email = $2
             ORDER BY id
             LIMIT 1`,
            [form.organization_id, normalizedEmail],
          );
          if (existing.rows.length > 0) {
            contactId = existing.rows[0].id;
          } else {
            const created = await client.query<{ id: number }>(
              `INSERT INTO contacts (
                 organization_id, first_name, last_name,
                 email, phone, company, source, tags
               )
               VALUES ($1, $2, $3, $4, $5, $6, 'form', $7)
               RETURNING id`,
              [
                form.organization_id,
                contactData.first_name || null,
                contactData.last_name || null,
                normalizedEmail,
                contactData.phone || null,
                contactData.company || null,
                form.contact_tags || [],
              ],
            );
            contactId = created.rows[0].id;
          }
        }
      }

      const submission = await client.query<{
        id: number;
        contact_id: number | null;
        created_at: Date;
      }>(
        `INSERT INTO form_submissions (
           form_id, organization_id, contact_id, data,
           ip_address, user_agent, referrer
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, contact_id, created_at`,
        [
          form.id,
          form.organization_id,
          contactId,
          JSON.stringify(normalizedData),
          String(context.ipAddress || '').slice(0, 50) || null,
          String(context.userAgent || '').slice(0, 2000) || null,
          String(context.referrer || '').slice(0, 500) || null,
        ],
      );
      const submissionRow = submission.rows[0];

      await client.query(
        `INSERT INTO workflow_triggers (
           workflow_id, organization_id, contact_id, trigger_type,
           entity_type, entity_id, payload, status, event_key,
           source, occurred_at, next_attempt_at
         ) VALUES (
           NULL, $1, $2, 'form_submitted',
           'form_submission', $3, $4::jsonb, 'queued', $5,
           'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
        [
          form.organization_id,
          contactId,
          submissionRow.id,
          JSON.stringify({
            form_id: form.id,
            form_name: form.name,
            form_slug: form.slug,
            submission_id: submissionRow.id,
          }),
          `domain:form_submitted:${submissionRow.id}`,
        ],
      );
      await this.enqueueSubmissionNotifications(client, form, submissionRow);
      return { status: 'ok', form };
    });
  }

  private async enqueueSubmissionNotifications(
    client: PoolClient,
    form: SubmittableFormRow,
    submission: { id: number; contact_id: number | null; created_at: Date },
  ): Promise<void> {
    if (!form.notify_on_submit || !Array.isArray(form.notification_emails)) {
      return;
    }
    const emails = [...new Set(form.notification_emails)];
    for (const email of emails) {
      const recipientHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .slice(0, 24);
      await client.query(
        `INSERT INTO workflow_side_effect_outbox (
           idempotency_key,
           organization_id,
           enrollment_run_at,
           effect_type,
           payload
         ) VALUES ($1, $2, $3, 'email', $4::jsonb)
         ON CONFLICT (idempotency_key) DO UPDATE SET
           idempotency_key = workflow_side_effect_outbox.idempotency_key`,
        [
          `form-submission-${submission.id}-notify-${recipientHash}`,
          form.organization_id,
          submission.created_at,
          JSON.stringify({
            to: email,
            subject: `New form submission: ${form.name}`,
            bodyHtml: [
              '<p>A new submission was received for ',
              `<strong>${escapeHtml(form.name)}</strong>.</p>`,
              '<p>Sign in to Itemize to review it.</p>',
            ].join(''),
            bodyText: `A new submission was received for ${form.name}. Sign in to Itemize to review it.`,
            contactId: submission.contact_id || null,
            formId: form.id,
            formSubmissionId: submission.id,
          }),
        ],
      );
    }
  }

  private async findPublishedForm<T extends { id: number }>(
    client: PoolClient,
    identifier: string,
    columns: string,
  ): Promise<T | null> {
    const byPublicId = await client.query<T>(
      `SELECT ${columns}
       FROM forms f
       JOIN organizations o ON f.organization_id = o.id
       WHERE f.public_id = $1
         AND f.status = 'published'`,
      [identifier],
    );
    if (byPublicId.rows.length === 1) return byPublicId.rows[0];

    const byLegacySlug = await client.query<T>(
      `SELECT ${columns}
       FROM forms f
       JOIN organizations o ON f.organization_id = o.id
       WHERE f.slug = $1
         AND f.status = 'published'
       ORDER BY f.id
       LIMIT 2`,
      [identifier],
    );
    return byLegacySlug.rows.length === 1 ? byLegacySlug.rows[0] : null;
  }

  private async formFields(
    client: PoolClient,
    formId: number,
    complete = false,
  ): Promise<PublicFormFieldRow[]> {
    const columns = complete
      ? `id, form_id, field_type, label, placeholder, help_text, is_required,
         validation, options, field_order, width, conditions,
         map_to_contact_field, created_at`
      : `id, field_type, label, placeholder, help_text,
         is_required, validation, options, field_order, width, conditions`;
    const result = await client.query<PublicFormFieldRow>(
      `SELECT ${columns}
       FROM form_fields
       WHERE form_id = $1
       ORDER BY field_order, id`,
      [formId],
    );
    return result.rows;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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
