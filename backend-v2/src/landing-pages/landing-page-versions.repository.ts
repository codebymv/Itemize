import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type LandingPageVersionRow = {
  id: number;
  page_id: number;
  version_number: number;
  content: Record<string, unknown> | string;
  description: string | null;
  created_by: number | null;
  created_by_name?: string | null;
  published_at: Date | null;
  is_current: boolean;
  created_at: Date;
};

type PageSnapshot = {
  name: string;
  description: string | null;
  slug: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  og_image: string | null;
  favicon_url: string | null;
  custom_css: string | null;
  custom_js: string | null;
  custom_head: string | null;
  sections: Array<{
    section_type: string;
    name: string | null;
    content: Record<string, unknown>;
    settings: Record<string, unknown>;
  }>;
};

type PublishResult =
  | { status: 'ok'; version: LandingPageVersionRow }
  | { status: 'not_found' }
  | { status: 'invalid_snapshot' };

const VERSION_COLUMNS = `
  pv.id, pv.page_id, pv.version_number, pv.content, pv.description,
  pv.created_by, pv.published_at, pv.is_current, pv.created_at`;

@Injectable()
export class LandingPageVersionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    organizationId: number,
    pageId: number,
  ): Promise<{ versions: LandingPageVersionRow[]; currentVersionId: number | null } | null> {
    const client = await this.pool.connect();
    try {
      const page = await client.query<{ current_version_id: number | null }>(
        `SELECT current_version_id FROM pages
         WHERE id = $1 AND organization_id = $2`,
        [pageId, organizationId],
      );
      if (page.rowCount === 0) return null;
      const versions = await client.query<LandingPageVersionRow>(
        `SELECT ${VERSION_COLUMNS}, u.name AS created_by_name
         FROM page_versions pv
         LEFT JOIN users u ON u.id = pv.created_by
         WHERE pv.page_id = $1
         ORDER BY pv.version_number DESC, pv.id DESC`,
        [pageId],
      );
      return {
        versions: versions.rows,
        currentVersionId: page.rows[0].current_version_id,
      };
    } finally {
      client.release();
    }
  }

  async find(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<LandingPageVersionRow | null> {
    const result = await this.pool.query<LandingPageVersionRow>(
      `SELECT ${VERSION_COLUMNS}, u.name AS created_by_name
       FROM page_versions pv
       JOIN pages p ON p.id = pv.page_id
       LEFT JOIN users u ON u.id = pv.created_by
       WHERE pv.id = $1 AND pv.page_id = $2 AND p.organization_id = $3`,
      [versionId, pageId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    organizationId: number,
    pageId: number,
    userId: number,
    description: string | null,
  ): Promise<LandingPageVersionRow | null> {
    return this.transaction(async (client) => {
      const page = await client.query<{
        name: string;
        description: string | null;
        slug: string;
        theme: Record<string, unknown> | null;
        settings: Record<string, unknown> | null;
        seo_title: string | null;
        seo_description: string | null;
        seo_keywords: string | null;
        og_image: string | null;
        favicon_url: string | null;
        custom_css: string | null;
        custom_js: string | null;
        custom_head: string | null;
      }>(
        `SELECT name, description, slug, theme, settings, seo_title,
                seo_description, seo_keywords, og_image, favicon_url,
                custom_css, custom_js, custom_head
         FROM pages WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [pageId, organizationId],
      );
      if (page.rowCount === 0) return null;
      const sections = await client.query<{
        section_type: string;
        name: string | null;
        content: Record<string, unknown> | null;
        settings: Record<string, unknown> | null;
      }>(
        `SELECT section_type, name, content, settings
         FROM page_sections WHERE page_id = $1
         ORDER BY section_order, id`,
        [pageId],
      );
      const next = await client.query<{ version_number: number }>(
        `SELECT COALESCE(MAX(version_number), 0)::int + 1 AS version_number
         FROM page_versions WHERE page_id = $1`,
        [pageId],
      );
      const versionNumber = next.rows[0].version_number;
      const snapshot: PageSnapshot = {
        ...page.rows[0],
        theme: page.rows[0].theme ?? {},
        settings: page.rows[0].settings ?? {},
        sections: sections.rows.map((section) => ({
          ...section,
          content: section.content ?? {},
          settings: section.settings ?? {},
        })),
      };
      const inserted = await client.query<LandingPageVersionRow>(
        `INSERT INTO page_versions (
           page_id, version_number, content, description, created_by
         ) VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING ${VERSION_COLUMNS.replaceAll('pv.', '')}`,
        [
          pageId,
          versionNumber,
          JSON.stringify(snapshot),
          description ?? `Version ${versionNumber}`,
          userId,
        ],
      );
      return inserted.rows[0];
    });
  }

  async publish(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<PublishResult> {
    return this.transaction(async (client) => {
      const page = await client.query(
        `SELECT id FROM pages
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [pageId, organizationId],
      );
      if (page.rowCount === 0) return { status: 'not_found' };
      const found = await client.query<LandingPageVersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM page_versions pv
         WHERE pv.id = $1 AND pv.page_id = $2 FOR UPDATE`,
        [versionId, pageId],
      );
      if (found.rowCount === 0) return { status: 'not_found' };
      const snapshot = this.snapshot(found.rows[0].content);
      if (!snapshot) return { status: 'invalid_snapshot' };

      await client.query(
        `UPDATE pages SET
           name = $1, description = $2, slug = $3, theme = $4::jsonb,
           settings = $5::jsonb, seo_title = $6, seo_description = $7,
           seo_keywords = $8, og_image = $9, favicon_url = $10,
           custom_css = $11, custom_js = $12, custom_head = $13,
           current_version_id = $14, published_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $15 AND organization_id = $16`,
        [
          snapshot.name,
          snapshot.description,
          snapshot.slug,
          JSON.stringify(snapshot.theme),
          JSON.stringify(snapshot.settings),
          snapshot.seo_title,
          snapshot.seo_description,
          snapshot.seo_keywords,
          snapshot.og_image,
          snapshot.favicon_url,
          snapshot.custom_css,
          snapshot.custom_js,
          snapshot.custom_head,
          versionId,
          pageId,
          organizationId,
        ],
      );
      await client.query('DELETE FROM page_sections WHERE page_id = $1', [pageId]);
      for (const [index, section] of snapshot.sections.entries()) {
        await client.query(
          `INSERT INTO page_sections (
             page_id, organization_id, section_type, name, content, settings,
             section_order
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
          [
            pageId,
            organizationId,
            section.section_type,
            section.name,
            JSON.stringify(section.content),
            JSON.stringify(section.settings),
            index,
          ],
        );
      }
      await client.query(
        `UPDATE page_versions SET is_current = (id = $1),
           published_at = CASE WHEN id = $1 THEN CURRENT_TIMESTAMP ELSE published_at END
         WHERE page_id = $2`,
        [versionId, pageId],
      );
      const updated = await client.query<LandingPageVersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM page_versions pv WHERE pv.id = $1`,
        [versionId],
      );
      return { status: 'ok', version: updated.rows[0] };
    });
  }

  async delete(
    organizationId: number,
    pageId: number,
    versionId: number,
  ): Promise<'deleted' | 'not_found' | 'current'> {
    return this.transaction(async (client) => {
      const page = await client.query<{ current_version_id: number | null }>(
        `SELECT current_version_id FROM pages
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [pageId, organizationId],
      );
      if (page.rowCount === 0) return 'not_found';
      if (page.rows[0].current_version_id === versionId) return 'current';
      const deleted = await client.query(
        `DELETE FROM page_versions WHERE id = $1 AND page_id = $2 RETURNING id`,
        [versionId, pageId],
      );
      return deleted.rowCount === 1 ? 'deleted' : 'not_found';
    });
  }

  async restore(
    organizationId: number,
    pageId: number,
    versionId: number,
    userId: number,
  ): Promise<LandingPageVersionRow | null> {
    return this.transaction(async (client) => {
      const page = await client.query(
        `SELECT id FROM pages
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [pageId, organizationId],
      );
      if (page.rowCount === 0) return null;
      const source = await client.query<LandingPageVersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM page_versions pv
         WHERE pv.id = $1 AND pv.page_id = $2`,
        [versionId, pageId],
      );
      if (source.rowCount === 0) return null;
      const next = await client.query<{ version_number: number }>(
        `SELECT COALESCE(MAX(version_number), 0)::int + 101 AS version_number
         FROM page_versions WHERE page_id = $1`,
        [pageId],
      );
      const inserted = await client.query<LandingPageVersionRow>(
        `INSERT INTO page_versions (
           page_id, version_number, content, description, created_by
         ) VALUES ($1,$2,$3::jsonb,$4,$5)
         RETURNING ${VERSION_COLUMNS.replaceAll('pv.', '')}`,
        [
          pageId,
          next.rows[0].version_number,
          JSON.stringify(this.json(source.rows[0].content)),
          `Restored from version ${source.rows[0].version_number}`,
          userId,
        ],
      );
      return inserted.rows[0];
    });
  }

  private snapshot(value: LandingPageVersionRow['content']): PageSnapshot | null {
    const parsed = this.json(value);
    const object = this.record(parsed);
    if (!object) return null;
    const name = this.string(object.name);
    const slug = this.string(object.slug);
    const theme = this.record(object.theme);
    const settings = this.record(object.settings) ?? {};
    if (!name || !slug || !theme || !Array.isArray(object.sections)) return null;
    if (object.sections.length > 250) return null;
    const sections: PageSnapshot['sections'] = [];
    for (const raw of object.sections) {
      const section = this.record(raw);
      const sectionType = this.string(section?.section_type);
      const content = this.record(section?.content);
      const sectionSettings = this.record(section?.settings);
      if (!section || !sectionType || !content || !sectionSettings) return null;
      sections.push({
        section_type: sectionType,
        name: typeof section.name === 'string' ? section.name : null,
        content,
        settings: sectionSettings,
      });
    }
    const nullable = (key: string) =>
      typeof object[key] === 'string' ? (object[key] as string) : null;
    return {
      name,
      description: nullable('description'),
      slug,
      theme,
      settings,
      seo_title: nullable('seo_title'),
      seo_description: nullable('seo_description'),
      seo_keywords: nullable('seo_keywords'),
      og_image: nullable('og_image'),
      favicon_url: nullable('favicon_url'),
      custom_css: nullable('custom_css'),
      custom_js: nullable('custom_js'),
      custom_head: nullable('custom_head'),
      sections,
    };
  }

  private json(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
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
