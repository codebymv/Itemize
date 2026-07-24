import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type LandingPageRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  slug: string;
  status: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  og_image: string | null;
  favicon_url: string | null;
  theme: Record<string, unknown> | null;
  custom_css: string | null;
  custom_js: string | null;
  custom_head: string | null;
  settings: Record<string, unknown> | null;
  current_version_id: number | null;
  view_count: number;
  unique_visitors: number;
  published_at: Date | null;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: Date;
  updated_at: Date;
  section_count?: number;
};

export type LandingPageSectionRow = {
  id: number;
  page_id: number;
  organization_id: number;
  section_type: string;
  name: string | null;
  content: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  section_order: number;
  created_at: Date;
  updated_at: Date;
};

export type SectionValue = {
  sectionType: string;
  name: string | null;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type PageValue = {
  name: string;
  description: string | null;
  slug: string;
  autoAllocateSlug: boolean;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImage: string | null;
  sections: SectionValue[];
};

export type UpdatePageValue = Partial<{
  name: string;
  description: string | null;
  slug: string;
  status: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImage: string | null;
  faviconUrl: string | null;
  customCss: string | null;
  customJs: string | null;
  customHead: string | null;
}>;

export type PageAggregate = {
  page: LandingPageRow;
  sections: LandingPageSectionRow[];
};

export type AnalyticsRows = {
  overall: {
    total_views: number;
    unique_visitors: number;
    avg_time_on_page: number | null;
    avg_scroll_depth: number | null;
    conversions: number;
  };
  views: Array<{ date: Date; views: number; unique_visitors: number }>;
  devices: Array<{ device_type: string | null; count: number }>;
  referrers: Array<{ referrer: string; count: number }>;
  utm: Array<{
    utm_source: string;
    utm_medium: string | null;
    utm_campaign: string | null;
    count: number;
  }>;
};

const PAGE_COLUMNS = `
  p.id, p.organization_id, p.name, p.description, p.slug, p.status,
  p.seo_title, p.seo_description, p.seo_keywords, p.og_image, p.favicon_url,
  p.theme, p.custom_css, p.custom_js, p.custom_head, p.settings,
  p.current_version_id, p.view_count, p.unique_visitors, p.published_at,
  p.created_by, p.created_at, p.updated_at`;

const SECTION_COLUMNS = `
  id, page_id, organization_id, section_type, name, content, settings,
  section_order, created_at, updated_at`;

@Injectable()
export class LandingPagesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    organizationId: number,
    status: string | undefined,
    search: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ rows: LandingPageRow[]; total: number }> {
    const client = await this.pool.connect();
    try {
      const conditions = ['p.organization_id = $1'];
      const values: unknown[] = [organizationId];
      if (status) {
        values.push(status);
        conditions.push(`p.status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
        conditions.push(
          `(p.name ILIKE $${values.length} ESCAPE '\\' OR p.slug ILIKE $${values.length} ESCAPE '\\')`,
        );
      }
      values.push(pageSize, (page - 1) * pageSize);
      const result = await client.query<LandingPageRow & { total_count: number }>(
        `SELECT ${PAGE_COLUMNS},
                u.name AS created_by_name,
                COUNT(s.id)::int AS section_count,
                COUNT(*) OVER()::int AS total_count
         FROM pages p
         LEFT JOIN users u ON u.id = p.created_by
         LEFT JOIN page_sections s ON s.page_id = p.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY p.id, u.name
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        rows: result.rows,
        total: result.rows[0]?.total_count ?? 0,
      };
    } finally {
      client.release();
    }
  }

  async find(organizationId: number, pageId: number): Promise<PageAggregate | null> {
    const client = await this.pool.connect();
    try {
      return this.findWithClient(client, organizationId, pageId);
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    value: PageValue,
  ): Promise<PageAggregate | { limit: { current: number; limit: number; plan: string } }> {
    return this.transaction(async (client) => {
      const organization = await client.query<{
        plan: string | null;
        landing_pages_limit: number | null;
      }>(
        `SELECT plan, landing_pages_limit
         FROM organizations WHERE id = $1 FOR UPDATE`,
        [organizationId],
      );
      const plan = organization.rows[0]?.plan ?? 'starter';
      const limit = organization.rows[0]?.landing_pages_limit ?? 10;
      const count = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM pages WHERE organization_id = $1',
        [organizationId],
      );
      const current = count.rows[0]?.count ?? 0;
      if (limit >= 0 && current >= limit) {
        return { limit: { current, limit, plan } };
      }
      const slug = value.autoAllocateSlug
        ? await this.availableSlug(client, organizationId, value.name)
        : value.slug;
      const inserted = await client.query<LandingPageRow>(
        `INSERT INTO pages (
           organization_id, name, description, slug, theme, settings,
           seo_title, seo_description, seo_keywords, og_image, created_by
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
         RETURNING ${PAGE_COLUMNS.replaceAll('p.', '')}`,
        [
          organizationId,
          value.name,
          value.description,
          slug,
          JSON.stringify(value.theme),
          JSON.stringify(value.settings),
          value.seoTitle,
          value.seoDescription,
          value.seoKeywords,
          value.ogImage,
          userId,
        ],
      );
      await this.insertSections(client, organizationId, inserted.rows[0].id, value.sections);
      return (await this.findWithClient(client, organizationId, inserted.rows[0].id))!;
    });
  }

  async update(
    organizationId: number,
    pageId: number,
    value: UpdatePageValue,
  ): Promise<PageAggregate | null> {
    return this.transaction(async (client) => {
      const mapping: Record<keyof UpdatePageValue, string> = {
        name: 'name',
        description: 'description',
        slug: 'slug',
        status: 'status',
        theme: 'theme',
        settings: 'settings',
        seoTitle: 'seo_title',
        seoDescription: 'seo_description',
        seoKeywords: 'seo_keywords',
        ogImage: 'og_image',
        faviconUrl: 'favicon_url',
        customCss: 'custom_css',
        customJs: 'custom_js',
        customHead: 'custom_head',
      };
      const entries = Object.entries(value) as Array<[keyof UpdatePageValue, unknown]>;
      const values: unknown[] = [];
      const sets = entries.map(([key, raw]) => {
        const column = mapping[key];
        values.push(
          key === 'theme' || key === 'settings' ? JSON.stringify(raw) : raw,
        );
        return `${column} = $${values.length}${key === 'theme' || key === 'settings' ? '::jsonb' : ''}`;
      });
      if (value.status === 'published') {
        sets.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
      }
      values.push(pageId, organizationId);
      const result = await client.query(
        `UPDATE pages
         SET ${sets.length > 0 ? `${sets.join(', ')}, ` : ''}updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length - 1} AND organization_id = $${values.length}
         RETURNING id`,
        values,
      );
      if (result.rowCount === 0) return null;
      return this.findWithClient(client, organizationId, pageId);
    });
  }

  async delete(organizationId: number, pageId: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM pages WHERE id = $1 AND organization_id = $2 RETURNING id',
      [pageId, organizationId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async setPasswordHash(
    organizationId: number,
    pageId: number,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE pages
       SET settings = jsonb_set(
             COALESCE(settings, '{}'::jsonb),
             '{password}',
             to_jsonb($3::text),
             true
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [pageId, organizationId, passwordHash],
    );
    return result.rowCount === 1;
  }

  async removePassword(
    organizationId: number,
    pageId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE pages
       SET settings = COALESCE(settings, '{}'::jsonb) - 'password',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [pageId, organizationId],
    );
    return result.rowCount === 1;
  }

  async duplicate(
    organizationId: number,
    userId: number,
    pageId: number,
  ): Promise<PageAggregate | null | { limit: { current: number; limit: number; plan: string } }> {
    return this.transaction(async (client) => {
      const organization = await client.query<{
        plan: string | null;
        landing_pages_limit: number | null;
      }>('SELECT plan, landing_pages_limit FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
      const plan = organization.rows[0]?.plan ?? 'starter';
      const limit = organization.rows[0]?.landing_pages_limit ?? 10;
      const count = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM pages WHERE organization_id = $1',
        [organizationId],
      );
      const current = count.rows[0]?.count ?? 0;
      if (limit >= 0 && current >= limit) return { limit: { current, limit, plan } };
      const original = await this.findWithClient(client, organizationId, pageId);
      if (!original) return null;
      const slug = await this.availableSlug(
        client,
        organizationId,
        `${original.page.name} Copy`,
      );
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO pages (
           organization_id, name, description, slug, status, theme, settings,
           seo_title, seo_description, seo_keywords, og_image, favicon_url,
           custom_css, custom_js, custom_head, created_by
         ) VALUES ($1,$2,$3,$4,'draft',$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          organizationId,
          `${original.page.name} Copy`,
          original.page.description,
          slug,
          JSON.stringify(original.page.theme ?? {}),
          JSON.stringify(original.page.settings ?? {}),
          original.page.seo_title,
          original.page.seo_description,
          original.page.seo_keywords,
          original.page.og_image,
          original.page.favicon_url,
          original.page.custom_css,
          original.page.custom_js,
          original.page.custom_head,
          userId,
        ],
      );
      await this.insertSections(
        client,
        organizationId,
        inserted.rows[0].id,
        original.sections.map((section) => ({
          sectionType: section.section_type,
          name: section.name,
          content: section.content ?? {},
          settings: section.settings ?? {},
        })),
      );
      return this.findWithClient(client, organizationId, inserted.rows[0].id);
    });
  }

  async replaceSections(
    organizationId: number,
    pageId: number,
    sections: SectionValue[],
  ): Promise<LandingPageSectionRow[] | null> {
    return this.transaction(async (client) => {
      if (!(await this.lockPage(client, organizationId, pageId))) return null;
      await client.query('DELETE FROM page_sections WHERE page_id = $1', [pageId]);
      await this.insertSections(client, organizationId, pageId, sections);
      await this.touchPage(client, pageId);
      return this.sections(client, pageId);
    });
  }

  async addSection(
    organizationId: number,
    pageId: number,
    value: SectionValue,
    position: number | undefined,
  ): Promise<LandingPageSectionRow | null> {
    return this.transaction(async (client) => {
      if (!(await this.lockPage(client, organizationId, pageId))) return null;
      const count = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM page_sections WHERE page_id = $1',
        [pageId],
      );
      const order = position === undefined
        ? count.rows[0].count
        : Math.min(position, count.rows[0].count);
      await client.query(
        `UPDATE page_sections SET section_order = section_order + 1
         WHERE page_id = $1 AND section_order >= $2`,
        [pageId, order],
      );
      const result = await client.query<LandingPageSectionRow>(
        `INSERT INTO page_sections (
           page_id, organization_id, section_type, name, content, settings, section_order
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
         RETURNING ${SECTION_COLUMNS}`,
        [
          pageId,
          organizationId,
          value.sectionType,
          value.name,
          JSON.stringify(value.content),
          JSON.stringify(value.settings),
          order,
        ],
      );
      await this.touchPage(client, pageId);
      return result.rows[0];
    });
  }

  async updateSection(
    organizationId: number,
    pageId: number,
    sectionId: number,
    value: Partial<SectionValue>,
  ): Promise<LandingPageSectionRow | null> {
    const mapping: Record<keyof SectionValue, string> = {
      sectionType: 'section_type',
      name: 'name',
      content: 'content',
      settings: 'settings',
    };
    return this.transaction(async (client) => {
      const values: unknown[] = [];
      const sets = (Object.entries(value) as Array<[keyof SectionValue, unknown]>)
        .map(([key, raw]) => {
          values.push(
            key === 'content' || key === 'settings' ? JSON.stringify(raw) : raw,
          );
          return `${mapping[key]} = $${values.length}${key === 'content' || key === 'settings' ? '::jsonb' : ''}`;
        });
      values.push(sectionId, pageId, organizationId);
      const result = await client.query<LandingPageSectionRow>(
        `UPDATE page_sections
         SET ${sets.length > 0 ? `${sets.join(', ')}, ` : ''}updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length - 2}
           AND page_id = $${values.length - 1}
           AND organization_id = $${values.length}
         RETURNING ${SECTION_COLUMNS}`,
        values,
      );
      if (result.rowCount === 0) return null;
      await this.touchPage(client, pageId);
      return result.rows[0];
    });
  }

  async deleteSection(
    organizationId: number,
    pageId: number,
    sectionId: number,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const removed = await client.query<{ section_order: number }>(
        `DELETE FROM page_sections
         WHERE id = $1 AND page_id = $2 AND organization_id = $3
         RETURNING section_order`,
        [sectionId, pageId, organizationId],
      );
      if (removed.rowCount === 0) return false;
      await client.query(
        `UPDATE page_sections SET section_order = section_order - 1
         WHERE page_id = $1 AND section_order > $2`,
        [pageId, removed.rows[0].section_order],
      );
      await this.touchPage(client, pageId);
      return true;
    });
  }

  async reorderSections(
    organizationId: number,
    pageId: number,
    sectionIds: number[],
  ): Promise<{
    matched: boolean;
    rows: LandingPageSectionRow[];
  } | null> {
    return this.transaction(async (client) => {
      if (!(await this.lockPage(client, organizationId, pageId))) return null;
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM page_sections WHERE page_id = $1 ORDER BY section_order FOR UPDATE`,
        [pageId],
      );
      const actual = existing.rows.map((row) => row.id).sort((a, b) => a - b);
      const requested = [...sectionIds].sort((a, b) => a - b);
      if (
        actual.length !== requested.length ||
        actual.some((id, index) => id !== requested[index])
      ) {
        return { matched: false, rows: [] };
      }
      await client.query(
        `UPDATE page_sections AS section
         SET section_order = ordered.position - 1, updated_at = CURRENT_TIMESTAMP
         FROM UNNEST($1::int[]) WITH ORDINALITY AS ordered(id, position)
         WHERE section.id = ordered.id AND section.page_id = $2`,
        [sectionIds, pageId],
      );
      await this.touchPage(client, pageId);
      return { matched: true, rows: await this.sections(client, pageId) };
    });
  }

  async analytics(
    organizationId: number,
    pageId: number,
    period: number,
  ): Promise<AnalyticsRows | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query(
        'SELECT id FROM pages WHERE id = $1 AND organization_id = $2',
        [pageId, organizationId],
      );
      if (found.rowCount === 0) return null;
      const params = [pageId, period];
      const overall = await client.query<AnalyticsRows['overall']>(
        `SELECT COUNT(*)::int AS total_views,
                COUNT(DISTINCT visitor_id)::int AS unique_visitors,
                AVG(time_on_page)::float8 AS avg_time_on_page,
                AVG(scroll_depth)::float8 AS avg_scroll_depth,
                COUNT(*) FILTER (WHERE converted = TRUE)::int AS conversions
         FROM page_analytics
         WHERE page_id = $1 AND viewed_at >= NOW() - ($2 * INTERVAL '1 day')`,
        params,
      );
      const views = await client.query<AnalyticsRows['views'][number]>(
        `SELECT DATE_TRUNC('day', viewed_at) AS date,
                COUNT(*)::int AS views,
                COUNT(DISTINCT visitor_id)::int AS unique_visitors
         FROM page_analytics
         WHERE page_id = $1 AND viewed_at >= NOW() - ($2 * INTERVAL '1 day')
         GROUP BY DATE_TRUNC('day', viewed_at) ORDER BY date`,
        params,
      );
      const devices = await client.query<AnalyticsRows['devices'][number]>(
        `SELECT device_type, COUNT(*)::int AS count
         FROM page_analytics
         WHERE page_id = $1 AND viewed_at >= NOW() - ($2 * INTERVAL '1 day')
         GROUP BY device_type ORDER BY device_type NULLS LAST`,
        params,
      );
      const referrers = await client.query<AnalyticsRows['referrers'][number]>(
        `SELECT COALESCE(referrer, 'Direct') AS referrer, COUNT(*)::int AS count
         FROM page_analytics
         WHERE page_id = $1 AND viewed_at >= NOW() - ($2 * INTERVAL '1 day')
         GROUP BY referrer ORDER BY count DESC, referrer LIMIT 10`,
        params,
      );
      const utm = await client.query<AnalyticsRows['utm'][number]>(
        `SELECT utm_source, utm_medium, utm_campaign, COUNT(*)::int AS count
         FROM page_analytics
         WHERE page_id = $1 AND viewed_at >= NOW() - ($2 * INTERVAL '1 day')
           AND utm_source IS NOT NULL
         GROUP BY utm_source, utm_medium, utm_campaign
         ORDER BY count DESC, utm_source LIMIT 10`,
        params,
      );
      return {
        overall: overall.rows[0],
        views: views.rows,
        devices: devices.rows,
        referrers: referrers.rows,
        utm: utm.rows,
      };
    } finally {
      client.release();
    }
  }

  async availableSlug(
    client: PoolClient,
    organizationId: number,
    name: string,
  ): Promise<string> {
    const base =
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) ||
      'page';
    for (let suffix = 0; suffix < 10000; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix}`;
      const found = await client.query(
        'SELECT 1 FROM pages WHERE organization_id = $1 AND slug = $2',
        [organizationId, candidate],
      );
      if (found.rowCount === 0) return candidate;
    }
    throw new Error('Unable to allocate landing-page slug');
  }

  private async findWithClient(
    client: PoolClient,
    organizationId: number,
    pageId: number,
  ): Promise<PageAggregate | null> {
    const page = await client.query<LandingPageRow>(
      `SELECT ${PAGE_COLUMNS}, u.name AS created_by_name,
              (SELECT COUNT(*)::int FROM page_sections s WHERE s.page_id = p.id) AS section_count
       FROM pages p LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = $1 AND p.organization_id = $2`,
      [pageId, organizationId],
    );
    if (page.rowCount === 0) return null;
    return { page: page.rows[0], sections: await this.sections(client, pageId) };
  }

  private async sections(
    client: PoolClient,
    pageId: number,
  ): Promise<LandingPageSectionRow[]> {
    const result = await client.query<LandingPageSectionRow>(
      `SELECT ${SECTION_COLUMNS}
       FROM page_sections WHERE page_id = $1
       ORDER BY section_order, id`,
      [pageId],
    );
    return result.rows;
  }

  private async insertSections(
    client: PoolClient,
    organizationId: number,
    pageId: number,
    sections: SectionValue[],
  ): Promise<void> {
    for (const [index, section] of sections.entries()) {
      await client.query(
        `INSERT INTO page_sections (
           page_id, organization_id, section_type, name, content, settings, section_order
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
        [
          pageId,
          organizationId,
          section.sectionType,
          section.name,
          JSON.stringify(section.content),
          JSON.stringify(section.settings),
          index,
        ],
      );
    }
  }

  private async lockPage(
    client: PoolClient,
    organizationId: number,
    pageId: number,
  ): Promise<boolean> {
    const result = await client.query(
      'SELECT id FROM pages WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [pageId, organizationId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  private async touchPage(client: PoolClient, pageId: number): Promise<void> {
    await client.query(
      'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [pageId],
    );
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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
