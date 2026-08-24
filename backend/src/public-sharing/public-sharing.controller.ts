import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PublicSharingService } from './public-sharing.service';

@Controller('api/shared')
export class PublicSharingController {
  constructor(private readonly sharing: PublicSharingService) {}

  @Get('list/:token')
  async list(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedList(token);
  }

  @Get('note/:token')
  async note(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedNote(token);
  }

  @Get('whiteboard/:token')
  async whiteboard(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedWhiteboard(token);
  }

  @Get('wireframe/:token')
  async wireframe(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedWireframe(token);
  }

  @Get('vault/:token')
  async vault(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.capabilityHeaders(response);
    return this.sharing.sharedVault(token);
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
