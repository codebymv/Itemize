import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  HttpCapabilityScoped,
  HttpPublicResourceScoped,
} from '../common/metadata';
import { PublicReputationService } from './public-reputation.service';

@Controller('api/reputation/public')
@HttpPublicResourceScoped()
export class PublicReputationController {
  constructor(private readonly reputation: PublicReputationService) {}

  @Get('widget/:widgetKey')
  async widget(
    @Param('widgetKey') widgetKey: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set('Cache-Control', 'no-store');
    return this.reputation.getPublicWidget(widgetKey);
  }

  @Get('review/:token')
  @HttpCapabilityScoped()
  async reviewRequest(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set('Cache-Control', 'no-store');
    return this.reputation.getPublicReviewRequest(token);
  }

  @Post('review/:token')
  @HttpCapabilityScoped()
  @HttpCode(200)
  async submitReview(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set('Cache-Control', 'no-store');
    return this.reputation.submitPublicReview(token, body ?? {});
  }
}
