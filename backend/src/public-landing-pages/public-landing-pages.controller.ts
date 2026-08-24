import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicLandingPagesService } from './public-landing-pages.service';

const headerValue = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
};

const queryValue = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

@Controller('api/pages/public/page')
export class PublicLandingPagesController {
  constructor(private readonly pages: PublicLandingPagesService) {}

  @Get(':slug')
  async page(@Param('slug') slug: string, @Req() request: Request) {
    const cookies = (request as Request & {
      cookies?: Record<string, string>;
    }).cookies;
    return this.pages.getPublicPage(slug, {
      providedPassword:
        headerValue(request.headers['x-page-password']) ??
        queryValue(request.query.password),
      visitorCookieId: cookies?.visitor_id ?? null,
      ipAddress: request.ip ?? null,
      userAgent: headerValue(request.headers['user-agent']),
      referrer: headerValue(request.headers['referer']),
      utm: {
        source: queryValue(request.query.utm_source),
        medium: queryValue(request.query.utm_medium),
        campaign: queryValue(request.query.utm_campaign),
        term: queryValue(request.query.utm_term),
        content: queryValue(request.query.utm_content),
      },
    });
  }

  @Post(':slug/analytics')
  @HttpCode(200)
  async analytics(@Body() body: Record<string, unknown>) {
    return this.pages.recordPublicPageAnalytics(body ?? {});
  }
}
