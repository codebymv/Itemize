import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type PublicPageRow = {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  og_image: string | null;
  favicon_url: string | null;
  theme: string | null;
  custom_css: string | null;
  custom_js: string | null;
  custom_head: string | null;
  settings: Record<string, unknown> | null;
  organization_name: string;
};

export type PublicPageSectionRow = {
  id: number;
  section_type: string;
  name: string | null;
  content: unknown;
  settings: unknown;
  section_order: number;
};

export type PageVisitValues = {
  visitorId: string;
  sessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  deviceType: string;
  browser: string;
  os: string;
};

export type AnalyticsUpdateValues = {
  visitorId: string;
  sessionId: string;
  timeOnPage: number | null;
  scrollDepth: number | null;
  converted: boolean | null;
  conversionType: string | null;
  conversionValue: number | null;
};

@Injectable()
export class PublicLandingPagesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async publishedPage(slug: string): Promise<PublicPageRow | null> {
    const result = await this.pool.query<PublicPageRow>(
      `SELECT p.id, p.organization_id, p.name, p.slug,
              p.seo_title, p.seo_description, p.seo_keywords,
              p.og_image, p.favicon_url, p.theme,
              p.custom_css, p.custom_js, p.custom_head, p.settings,
              o.name as organization_name
       FROM pages p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.slug = $1 AND p.status = 'published'`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  async pageSections(pageId: number): Promise<PublicPageSectionRow[]> {
    const result = await this.pool.query<PublicPageSectionRow>(
      `SELECT id, section_type, name, content, settings, section_order
       FROM page_sections
       WHERE page_id = $1
       ORDER BY section_order`,
      [pageId],
    );
    return result.rows;
  }

  async recordVisit(
    pageId: number,
    organizationId: number,
    visit: PageVisitValues,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO page_analytics (
         page_id, organization_id, visitor_id, session_id,
         ip_address, user_agent, referrer,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         device_type, browser, os
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        pageId,
        organizationId,
        visit.visitorId,
        visit.sessionId,
        visit.ipAddress,
        visit.userAgent,
        visit.referrer,
        visit.utmSource,
        visit.utmMedium,
        visit.utmCampaign,
        visit.utmTerm,
        visit.utmContent,
        visit.deviceType,
        visit.browser,
        visit.os,
      ],
    );
    await this.pool.query(
      'UPDATE pages SET view_count = view_count + 1 WHERE id = $1',
      [pageId],
    );
  }

  async updateAnalytics(values: AnalyticsUpdateValues): Promise<void> {
    await this.pool.query(
      `UPDATE page_analytics SET
         time_on_page = COALESCE($1, time_on_page),
         scroll_depth = GREATEST(COALESCE($2, 0), scroll_depth),
         converted = COALESCE($3, converted),
         conversion_type = COALESCE($4, conversion_type),
         conversion_value = COALESCE($5, conversion_value),
         left_at = CURRENT_TIMESTAMP
       WHERE visitor_id = $6 AND session_id = $7`,
      [
        values.timeOnPage,
        values.scrollDepth,
        values.converted,
        values.conversionType,
        values.conversionValue,
        values.visitorId,
        values.sessionId,
      ],
    );
  }
}
