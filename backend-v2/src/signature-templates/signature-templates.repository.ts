import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type SignatureTemplateRow = {
  id: number;
  organization_id: number;
  title: string;
  description: string | null;
  message: string | null;
  has_file: boolean;
  file_name: string | null;
  file_type: string | null;
  file_size: number | string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};

export type SignatureTemplateRoleRow = {
  id: number;
  template_id: number;
  role_name: string;
  signing_order: number;
};

export type SignatureTemplateFieldRow = {
  id: number;
  template_id: number;
  role_name: string | null;
  field_type: string;
  page_number: number;
  x_position: number | string;
  y_position: number | string;
  width: number | string;
  height: number | string;
  label: string | null;
  is_required: boolean;
  font_size: number | null;
  font_family: string | null;
  text_align: string | null;
  locked: boolean;
};

const columns = `t.id,t.organization_id,t.title,t.description,t.message,
  t.file_url IS NOT NULL AS has_file,t.file_name,t.file_type,t.file_size,
  t.created_by,t.created_at,t.updated_at`;

@Injectable()
export class SignatureTemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id=$1',
      [organizationId],
    );
    const organization = result.rows[0];
    return organization !== undefined
      && ['starter', 'unlimited', 'pro'].includes(organization.plan ?? 'starter');
  }

  async findAll(organizationId: number): Promise<SignatureTemplateRow[]> {
    const result = await this.pool.query<SignatureTemplateRow>(
      `SELECT ${columns} FROM signature_templates t
       WHERE t.organization_id=$1 ORDER BY t.created_at DESC,t.id DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async findDetail(
    organizationId: number,
    id: number,
  ): Promise<{
    template: SignatureTemplateRow;
    roles: SignatureTemplateRoleRow[];
    fields: SignatureTemplateFieldRow[];
  } | null> {
    return this.snapshot(async (client) => {
      const template = await client.query<SignatureTemplateRow>(
        `SELECT ${columns} FROM signature_templates t
         WHERE t.id=$1 AND t.organization_id=$2`,
        [id, organizationId],
      );
      if (!template.rows[0]) return null;

      const roles = await client.query<SignatureTemplateRoleRow>(
        `SELECT r.id,r.template_id,r.role_name,r.signing_order
         FROM signature_template_roles r
         JOIN signature_templates t ON t.id=r.template_id
         WHERE r.template_id=$1 AND t.organization_id=$2
         ORDER BY r.signing_order ASC,r.id ASC`,
        [id, organizationId],
      );
      const fields = await client.query<SignatureTemplateFieldRow>(
        `SELECT f.id,f.template_id,f.role_name,f.field_type,f.page_number,
           f.x_position,f.y_position,f.width,f.height,f.label,f.is_required,
           f.font_size,f.font_family,f.text_align,f.locked
         FROM signature_template_fields f
         JOIN signature_templates t ON t.id=f.template_id
         WHERE f.template_id=$1 AND t.organization_id=$2 ORDER BY f.id ASC`,
        [id, organizationId],
      );

      return {
        template: template.rows[0],
        roles: roles.rows,
        fields: fields.rows,
      };
    });
  }

  private async snapshot<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
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
