import { Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { EstimatePublicService } from './estimate-public.service';

@Controller('api/public/estimates')
export class EstimatePublicController {
  constructor(private readonly estimates: EstimatePublicService) {}

  @Get(':token')
  async open(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return { success: true, data: await this.estimates.open(token) };
  }

  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return { success: true, data: await this.estimates.accept(token) };
  }

  @Post(':token/decline')
  @HttpCode(200)
  async decline(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return { success: true, data: await this.estimates.decline(token) };
  }

  private private(response: Response): void {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
}
