import {
  BadRequestException,
  GoneException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PublicLandingPagesRepository } from './public-landing-pages.repository';

export type PublicPageRequestContext = {
  providedPassword: string | null;
  visitorCookieId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
};

export function parseDeviceInfo(userAgent: string | null): {
  deviceType: string;
  browser: string;
  os: string;
} {
  const ua = userAgent?.toLowerCase() || '';

  let deviceType = 'desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
    deviceType = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
  }

  let browser = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

  let os = 'unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return { deviceType, browser, os };
}

@Injectable()
export class PublicLandingPagesService {
  private readonly logger = new Logger(PublicLandingPagesService.name);

  constructor(private readonly repository: PublicLandingPagesRepository) {}

  async getPublicPage(slug: string, context: PublicPageRequestContext) {
    try {
      const page = await this.repository.publishedPage(slug);
      if (!page) throw new NotFoundException({ error: 'Page not found' });
      const settings = (page.settings ?? {}) as {
        password?: string;
        expiresAt?: string;
        enableAnalytics?: boolean;
      };

      if (settings.password) {
        if (!context.providedPassword) {
          throw new UnauthorizedException({
            error: 'Password required',
            password_protected: true,
          });
        }
        const isValidPassword = settings.password.startsWith('$2')
          ? await bcrypt.compare(context.providedPassword, settings.password)
          : context.providedPassword === settings.password;
        if (!isValidPassword) {
          throw new UnauthorizedException({
            error: 'Invalid password',
            password_protected: true,
          });
        }
      }

      if (settings.expiresAt && new Date(settings.expiresAt) < new Date()) {
        throw new GoneException({ error: 'Page has expired' });
      }

      const sections = await this.repository.pageSections(page.id);

      if (settings.enableAnalytics !== false) {
        const device = parseDeviceInfo(context.userAgent);
        await this.repository.recordVisit(page.id, page.organization_id, {
          visitorId:
            context.visitorCookieId || crypto.randomBytes(16).toString('hex'),
          sessionId: crypto.randomBytes(8).toString('hex'),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          referrer: context.referrer,
          utmSource: context.utm.source,
          utmMedium: context.utm.medium,
          utmCampaign: context.utm.campaign,
          utmTerm: context.utm.term,
          utmContent: context.utm.content,
          deviceType: device.deviceType,
          browser: device.browser,
          os: device.os,
        });
      }

      return {
        id: page.id,
        name: page.name,
        slug: page.slug,
        seo_title: page.seo_title,
        seo_description: page.seo_description,
        seo_keywords: page.seo_keywords,
        og_image: page.og_image,
        favicon_url: page.favicon_url,
        theme: page.theme,
        custom_css: page.custom_css,
        custom_js: page.custom_js,
        custom_head: page.custom_head,
        organization_name: page.organization_name,
        sections,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error fetching public page: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException({ error: 'Failed to fetch page' });
    }
  }

  async recordPublicPageAnalytics(body: {
    visitor_id?: unknown;
    session_id?: unknown;
    time_on_page?: unknown;
    scroll_depth?: unknown;
    converted?: unknown;
    conversion_type?: unknown;
    conversion_value?: unknown;
  }) {
    if (!body.visitor_id || !body.session_id) {
      throw new BadRequestException({
        error: 'Visitor and session IDs required',
      });
    }
    try {
      await this.repository.updateAnalytics({
        visitorId: String(body.visitor_id),
        sessionId: String(body.session_id),
        timeOnPage: this.optionalNumber(body.time_on_page),
        scrollDepth: this.optionalNumber(body.scroll_depth),
        converted: typeof body.converted === 'boolean' ? body.converted : null,
        conversionType:
          typeof body.conversion_type === 'string' ? body.conversion_type : null,
        conversionValue: this.optionalNumber(body.conversion_value),
      });
    } catch (error) {
      this.logger.error(
        `Error updating analytics: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException({
        error: 'Failed to update analytics',
      });
    }
    return { success: true };
  }

  private optionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
