import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type FormFieldValue = {
  id?: number;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  validation: Record<string, unknown>;
  options: unknown[];
  width: string;
  conditions: Record<string, unknown>[];
  mapToContactField: string | null;
};

export type FormRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  slug: string;
  public_id: string;
  type: string;
  status: string;
  submit_button_text: string;
  success_message: string;
  redirect_url: string | null;
  notify_on_submit: boolean;
  notification_emails: string[] | null;
  theme: Record<string, unknown> | null;
  create_contact: boolean;
  contact_tags: string[] | null;
  created_by: number | null;
  submission_count: number;
  field_count: number;
  created_at: Date;
  updated_at: Date;
};

export type FormFieldRow = {
  id: number;
  form_id: number;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  validation: Record<string, unknown> | null;
  options: unknown[] | null;
  field_order: number;
  width: string;
  conditions: Record<string, unknown>[] | null;
  map_to_contact_field: string | null;
  created_at: Date;
};

export type FormSubmissionRow = {
  id: number;
  form_id: number;
  organization_id: number;
  contact_id: number | null;
  data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  score: number | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  created_at: Date;
};

export type CreateFormValues = {
  name: string;
  description: string | null;
  slug: string;
  type: string;
  submitButtonText: string;
  successMessage: string;
  redirectUrl: string | null;
  notifyOnSubmit: boolean;
  notificationEmails: string[];
  theme: Record<string, unknown>;
  createContact: boolean;
  contactTags: string[];
  fields: FormFieldValue[];
};

export type UpdateFormValues = Partial<{
  name: string;
  description: string | null;
  type: string;
  status: string;
  submitButtonText: string;
  successMessage: string;
  redirectUrl: string | null;
  notifyOnSubmit: boolean;
  notificationEmails: string[];
  theme: Record<string, unknown>;
  createContact: boolean;
  contactTags: string[];
}>;

export type FormWithFields = { form: FormRow; fields: FormFieldRow[] };
export type FormLimit = { current: number; limit: number; plan: string };
export type CreateFormOutcome =
  | { kind: 'created'; value: FormWithFields }
  | { kind: 'limit'; limit: FormLimit };

const formSelection = `
  f.id,
  f.organization_id,
  f.name,
  f.description,
  f.slug,
  f.public_id,
  f.type,
  f.status,
  f.submit_button_text,
  f.success_message,
  f.redirect_url,
  f.notify_on_submit,
  f.notification_emails,
  f.theme,
  f.create_contact,
  f.contact_tags,
  f.created_by,
  f.created_at,
  f.updated_at,
  (SELECT COUNT(*)::int FROM form_submissions s WHERE s.form_id = f.id) AS submission_count,
  (SELECT COUNT(*)::int FROM form_fields field WHERE field.form_id = f.id) AS field_count`;

const fieldSelection = `
  field.id,
  field.form_id,
  field.field_type,
  field.label,
  field.placeholder,
  field.help_text,
  field.is_required,
  field.validation,
  field.options,
  field.field_order,
  field.width,
  field.conditions,
  field.map_to_contact_field,
  field.created_at`;

@Injectable()
export class FormsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    organizationId: number,
    status?: string,
  ): Promise<FormWithFields[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<FormRow>(
        `SELECT ${formSelection}
         FROM forms f
         WHERE f.organization_id = $1
           AND ($2::text IS NULL OR f.status = $2)
         ORDER BY f.created_at DESC, f.id DESC`,
        [organizationId, status ?? null],
      );
      if (result.rows.length === 0) return [];
      const fields = await client.query<FormFieldRow>(
        `SELECT ${fieldSelection}
         FROM form_fields field
         WHERE field.form_id = ANY($1::int[])
         ORDER BY field.form_id, field.field_order, field.id`,
        [result.rows.map((row) => row.id)],
      );
      const fieldsByForm = new Map<number, FormFieldRow[]>();
      for (const field of fields.rows) {
        const rows = fieldsByForm.get(Number(field.form_id)) ?? [];
        rows.push(field);
        fieldsByForm.set(Number(field.form_id), rows);
      }
      return result.rows.map((form) => ({
        form,
        fields: fieldsByForm.get(Number(form.id)) ?? [],
      }));
    } finally {
      client.release();
    }
  }

  async findById(
    organizationId: number,
    formId: number,
  ): Promise<FormWithFields | null> {
    const client = await this.pool.connect();
    try {
      return this.selectById(client, organizationId, formId);
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: CreateFormValues,
  ): Promise<CreateFormOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const limit = await this.formLimit(client, organizationId);
      if (limit.limit !== -1 && limit.current >= limit.limit) {
        return { kind: 'limit', limit };
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO forms (
           organization_id, name, description, slug, type,
           submit_button_text, success_message, redirect_url,
           notify_on_submit, notification_emails, theme,
           create_contact, contact_tags, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11::jsonb,
           $12, $13, $14
         )
         RETURNING id`,
        [
          organizationId,
          values.name,
          values.description,
          values.slug,
          values.type,
          values.submitButtonText,
          values.successMessage,
          values.redirectUrl,
          values.notifyOnSubmit,
          values.notificationEmails,
          JSON.stringify(values.theme),
          values.createContact,
          values.contactTags,
          userId,
        ],
      );
      await this.insertFields(client, inserted.rows[0].id, values.fields);
      const created = await this.selectById(
        client,
        organizationId,
        inserted.rows[0].id,
      );
      if (!created) throw new Error('Created form could not be reloaded');
      return { kind: 'created', value: created };
    });
  }

  async update(
    organizationId: number,
    formId: number,
    values: UpdateFormValues,
    validateBeforePublish?: (fields: FormFieldRow[]) => void,
  ): Promise<FormWithFields | null> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number }>(
        `SELECT id FROM forms
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [formId, organizationId],
      );
      if (owned.rows.length === 0) return null;
      if (values.status === 'published' && validateBeforePublish) {
        validateBeforePublish(await this.selectFields(client, formId));
      }

      const columns: Record<keyof UpdateFormValues, string> = {
        name: 'name',
        description: 'description',
        type: 'type',
        status: 'status',
        submitButtonText: 'submit_button_text',
        successMessage: 'success_message',
        redirectUrl: 'redirect_url',
        notifyOnSubmit: 'notify_on_submit',
        notificationEmails: 'notification_emails',
        theme: 'theme',
        createContact: 'create_contact',
        contactTags: 'contact_tags',
      };
      const assignments: string[] = [];
      const params: unknown[] = [formId, organizationId];
      for (const [key, value] of Object.entries(values) as [
        keyof UpdateFormValues,
        unknown,
      ][]) {
        params.push(key === 'theme' ? JSON.stringify(value) : value);
        assignments.push(
          `${columns[key]} = $${params.length}${key === 'theme' ? '::jsonb' : ''}`,
        );
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE forms
           SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2`,
          params,
        );
      }
      return this.selectById(client, organizationId, formId);
    });
  }

  async delete(organizationId: number, formId: number): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM forms
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [formId, organizationId],
    );
    return result.rows.length === 1;
  }

  async duplicate(
    organizationId: number,
    userId: number,
    formId: number,
    slug: string,
  ): Promise<FormWithFields | null> {
    return this.transaction(async (client) => {
      const locked = await client.query(
        `SELECT id FROM forms
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [formId, organizationId],
      );
      if (locked.rows.length === 0) return null;
      const source = await this.selectById(client, organizationId, formId);
      if (!source) throw new Error('Locked form could not be reloaded');
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO forms (
           organization_id, name, description, slug, type, status,
           submit_button_text, success_message, redirect_url,
           notify_on_submit, notification_emails, theme,
           create_contact, contact_tags, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, 'draft',
           $6, $7, $8,
           $9, $10, $11::jsonb,
           $12, $13, $14
         )
         RETURNING id`,
        [
          organizationId,
          `${source.form.name} (Copy)`,
          source.form.description,
          slug,
          source.form.type,
          source.form.submit_button_text,
          source.form.success_message,
          source.form.redirect_url,
          source.form.notify_on_submit,
          source.form.notification_emails ?? [],
          JSON.stringify(source.form.theme ?? {}),
          source.form.create_contact,
          source.form.contact_tags ?? [],
          userId,
        ],
      );
      await this.insertFields(
        client,
        inserted.rows[0].id,
        source.fields.map((field) => ({
          id: field.id,
          fieldType: field.field_type,
          label: field.label,
          placeholder: field.placeholder,
          helpText: field.help_text,
          isRequired: field.is_required,
          validation: field.validation ?? {},
          options: field.options ?? [],
          width: field.width,
          conditions: field.conditions ?? [],
          mapToContactField: field.map_to_contact_field,
        })),
      );
      return this.selectById(client, organizationId, inserted.rows[0].id);
    });
  }

  async replaceFields(
    organizationId: number,
    formId: number,
    fields: FormFieldValue[],
    validateForStatus: (status: string) => void,
  ): Promise<FormFieldRow[] | null> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number; status: string }>(
        `SELECT id, status FROM forms
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [formId, organizationId],
      );
      if (owned.rows.length === 0) return null;
      validateForStatus(owned.rows[0].status);
      await client.query('DELETE FROM form_fields WHERE form_id = $1', [formId]);
      await this.insertFields(client, formId, fields);
      return this.selectFields(client, formId);
    });
  }

  async listSubmissions(
    organizationId: number,
    formId: number,
    page: number,
    limit: number,
  ): Promise<{ submissions: FormSubmissionRow[]; total: number } | null> {
    const client = await this.pool.connect();
    try {
      const owned = await client.query(
        'SELECT id FROM forms WHERE id = $1 AND organization_id = $2',
        [formId, organizationId],
      );
      if (owned.rows.length === 0) return null;
      const count = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM form_submissions
         WHERE form_id = $1 AND organization_id = $2`,
        [formId, organizationId],
      );
      const submissions = await client.query<FormSubmissionRow>(
        `SELECT
           submission.id,
           submission.form_id,
           submission.organization_id,
           submission.contact_id,
           submission.data,
           submission.ip_address,
           submission.user_agent,
           submission.referrer,
           submission.score,
           contact.first_name AS contact_first_name,
           contact.last_name AS contact_last_name,
           contact.email AS contact_email,
           submission.created_at
         FROM form_submissions submission
         LEFT JOIN contacts contact
           ON contact.id = submission.contact_id
          AND contact.organization_id = submission.organization_id
         WHERE submission.form_id = $1
           AND submission.organization_id = $2
         ORDER BY submission.created_at DESC, submission.id DESC
         LIMIT $3 OFFSET $4`,
        [formId, organizationId, limit, (page - 1) * limit],
      );
      return { submissions: submissions.rows, total: count.rows[0].count };
    } finally {
      client.release();
    }
  }

  async deleteSubmission(
    organizationId: number,
    formId: number,
    submissionId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM form_submissions
       WHERE id = $1 AND form_id = $2 AND organization_id = $3
       RETURNING id`,
      [submissionId, formId, organizationId],
    );
    return result.rows.length === 1;
  }

  private async selectById(
    client: PoolClient,
    organizationId: number,
    formId: number,
  ): Promise<FormWithFields | null> {
    const form = await client.query<FormRow>(
      `SELECT ${formSelection}
       FROM forms f
       WHERE f.id = $1 AND f.organization_id = $2`,
      [formId, organizationId],
    );
    if (form.rows.length === 0) return null;
    return {
      form: form.rows[0],
      fields: await this.selectFields(client, formId),
    };
  }

  private async selectFields(
    client: PoolClient,
    formId: number,
  ): Promise<FormFieldRow[]> {
    const fields = await client.query<FormFieldRow>(
      `SELECT ${fieldSelection}
       FROM form_fields field
       WHERE field.form_id = $1
       ORDER BY field.field_order, field.id`,
      [formId],
    );
    return fields.rows;
  }

  private async insertFields(
    client: PoolClient,
    formId: number,
    fields: FormFieldValue[],
  ): Promise<void> {
    const sourceToInserted = new Map<string, number>();
    const insertedIds: number[] = [];
    for (let order = 0; order < fields.length; order += 1) {
      const field = fields[order];
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO form_fields (
           form_id, field_type, label, placeholder, help_text,
           is_required, validation, options, field_order, width,
           conditions, map_to_contact_field
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7::jsonb, $8::jsonb, $9, $10,
           '[]'::jsonb, $11
         )
         RETURNING id`,
        [
          formId,
          field.fieldType,
          field.label,
          field.placeholder,
          field.helpText,
          field.isRequired,
          JSON.stringify(field.validation),
          JSON.stringify(field.options),
          order,
          field.width,
          field.mapToContactField,
        ],
      );
      const insertedId = inserted.rows[0].id;
      insertedIds.push(insertedId);
      if (field.id !== undefined) {
        sourceToInserted.set(String(field.id), insertedId);
      }
    }
    for (let index = 0; index < fields.length; index += 1) {
      const conditions = fields[index].conditions.map((condition) => {
        const sourceId = String(condition.field_id ?? condition.fieldId ?? '');
        const mappedId = sourceToInserted.get(sourceId);
        if (!mappedId) throw new Error('Validated field condition could not be remapped');
        const { fieldId: _fieldId, ...rest } = condition;
        return { ...rest, field_id: mappedId };
      });
      if (conditions.length > 0) {
        await client.query(
          `UPDATE form_fields
           SET conditions = $1::jsonb
           WHERE id = $2 AND form_id = $3`,
          [JSON.stringify(conditions), insertedIds[index], formId],
        );
      }
    }
  }

  private async formLimit(
    client: PoolClient,
    organizationId: number,
  ): Promise<FormLimit> {
    const result = await client.query<{
      plan: string | null;
      forms_limit: number | null;
      current: number;
    }>(
      `SELECT
         organization.plan,
         organization.forms_limit,
         (SELECT COUNT(*)::int FROM forms WHERE organization_id = organization.id) AS current
       FROM organizations organization
       WHERE organization.id = $1`,
      [organizationId],
    );
    const row = result.rows[0];
    return {
      plan: row?.plan ?? 'starter',
      limit: row?.forms_limit ?? 10,
      current: row?.current ?? 0,
    };
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
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
