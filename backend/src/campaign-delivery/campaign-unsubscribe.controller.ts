import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CampaignUnsubscribeService } from './campaign-unsubscribe.service';

const page = (state: 'ready' | 'unsubscribed' | 'invalid', token: string): string => {
  const copy = state === 'ready'
    ? {
      title: 'Unsubscribe from emails?',
      detail: 'You will no longer receive campaign emails from this sender.',
    }
    : state === 'unsubscribed'
      ? { title: 'You are unsubscribed', detail: 'Your email preferences have been updated.' }
      : { title: 'This link is unavailable', detail: 'The unsubscribe link is invalid or no longer available.' };
  const action = state === 'ready'
    ? `<form method="post" action="/api/campaigns/unsubscribe/${token}"><input type="hidden" name="confirm" value="1"><button type="submit">Unsubscribe</button></form>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${copy.title}</title><style>body{margin:0;background:#f1f5f9;color:#0f172a;font-family:Raleway,Segoe UI,Arial,sans-serif}main{box-sizing:border-box;max-width:560px;margin:10vh auto;padding:32px 28px;background:#fff;border:1px solid #e2e8f0;border-top:4px solid #2563eb;border-radius:12px;box-shadow:0 12px 30px rgba(15,23,42,.08)}h1{margin:0 0 12px;font-size:26px}p{margin:0 0 24px;color:#475569;line-height:1.6}button{border:0;border-radius:8px;background:#2563eb;color:#fff;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}button:hover{background:#1d4ed8}@media(max-width:620px){main{margin:24px 16px;padding:28px 22px}}</style></head><body><main><h1>${copy.title}</h1><p>${copy.detail}</p>${action}</main></body></html>`;
};

@Controller('api/campaigns/unsubscribe')
export class CampaignUnsubscribeController {
  constructor(private readonly unsubscribeService: CampaignUnsubscribeService) {}

  @Get(':token')
  async inspect(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const result = await this.unsubscribeService.inspect(token);
    this.headers(response);
    response.status(result === 'invalid' ? 404 : 200).type('html').send(page(result, token));
  }

  @Post(':token')
  async unsubscribe(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.unsubscribeService.unsubscribe(token);
    this.headers(response);
    if (result === 'invalid') {
      response.status(404).type('html').send(page('invalid', token));
      return;
    }
    if (body?.['List-Unsubscribe'] === 'One-Click') {
      response.status(200).send('');
      return;
    }
    response.status(200).type('html').send(page('unsubscribed', token));
  }

  private headers(response: Response): void {
    response.set('Cache-Control', 'no-store, max-age=0');
    response.set('X-Robots-Tag', 'noindex, nofollow');
    response.set('Referrer-Policy', 'no-referrer');
  }
}
