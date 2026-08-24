import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PublicFormsService } from './public-forms.service';

@Controller('api/forms/public/form')
export class PublicFormsController {
  constructor(private readonly forms: PublicFormsService) {}

  @Get(':identifier')
  async form(
    @Param('identifier') identifier: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.forms.getPublicForm(identifier);
    // The retained route sets these headers only on the success path.
    response.set('Cache-Control', 'no-store');
    response.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  }

  @Post(':identifier')
  @HttpCode(201)
  async submit(
    @Param('identifier') identifier: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.forms.submitPublicForm(identifier, body ?? {}, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
      referrer: request.get('referrer') ?? null,
    });
    response.set('Cache-Control', 'no-store');
    return result;
  }
}
