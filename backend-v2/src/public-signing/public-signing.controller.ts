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
import { PublicSigningAudit } from './public-signing.repository';
import { PublicSigningService } from './public-signing.service';

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

@Controller('api/public/sign')
export class PublicSigningController {
  constructor(private readonly signing: PublicSigningService) {}

  @Post(':token/verify')
  verify(@Res({ passthrough: true }) response: Response): never {
    this.private(response);
    return this.signing.verify();
  }

  @Post(':token/decline')
  @HttpCode(200)
  async decline(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return {
      success: true,
      data: await this.signing.decline(token, body, this.audit(request)),
    };
  }

  @Get(':token/download')
  async download(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.signing.file(token);
    this.send(response, file, 'attachment');
  }

  @Get(':token/file')
  async file(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.signing.file(token);
    this.send(response, file, 'inline');
  }

  @Get(':token')
  async session(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return {
      success: true,
      data: await this.signing.session(token, this.audit(request)),
    };
  }

  @Post(':token')
  @HttpCode(200)
  async submit(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.private(response);
    return {
      success: true,
      data: await this.signing.submit(token, body, this.audit(request)),
    };
  }

  private audit(request: Request): PublicSigningAudit {
    const requestWithId = request as Request & { requestId?: string };
    const supplied = requestWithId.requestId || request.get('x-request-id') || '';
    return {
      ipAddress: String(request.ip || '').slice(0, 100) || null,
      userAgent: String(request.get('user-agent') || '').slice(0, 1000) || null,
      requestId: REQUEST_ID.test(supplied) ? supplied : null,
    };
  }

  private send(
    response: Response,
    file: { buffer: Buffer; filename: string },
    disposition: 'inline' | 'attachment',
  ): void {
    this.private(response);
    response.set({
      'Content-Disposition': `${disposition}; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Content-Security-Policy': 'sandbox',
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(file.buffer);
  }

  private private(response: Response): void {
    response.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
}
