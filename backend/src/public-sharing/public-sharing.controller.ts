import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AccessTokenService } from '../auth/access-token.service';
import { PublicSharingService } from './public-sharing.service';

@Controller('api/shared')
export class PublicSharingController {
  constructor(
    private readonly sharing: PublicSharingService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  @Get('list/:token')
  async list(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedList(token, await this.optionalViewerId(request));
  }

  @Get('note/:token')
  async note(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedNote(token, await this.optionalViewerId(request));
  }

  @Get('whiteboard/:token')
  async whiteboard(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedWhiteboard(
      token,
      await this.optionalViewerId(request),
    );
  }

  @Get('wireframe/:token')
  async wireframe(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedWireframe(
      token,
      await this.optionalViewerId(request),
    );
  }

  @Get('vault/:token')
  async vault(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedVault(token, await this.optionalViewerId(request));
  }

  private async optionalViewerId(request: Request): Promise<number | null> {
    const token = request.cookies?.itemize_auth;
    if (typeof token !== 'string' || token.length === 0) return null;
    try {
      return (await this.accessTokens.verify(token)).userId;
    } catch {
      return null;
    }
  }

  private capabilityHeaders(response: Response): void {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
}
