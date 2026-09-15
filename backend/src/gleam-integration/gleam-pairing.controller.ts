import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { HttpCapabilityScoped } from '../common/metadata';
import { GleamPairingService } from './gleam-pairing.service';

@HttpCapabilityScoped()
@Controller('api/integrations/gleam/pairing')
export class GleamPairingController {
  constructor(private readonly pairing: GleamPairingService) {}
  @Post('claim')
  @HttpCode(200)
  claim(@Req() request: Request, @Body() input: unknown) {
    // Service verifies the expiring code before peer I/O and rechecks it under the row lock.
    return this.pairing.claim((request.headers.authorization || '').replace(/^Bearer /, ''), input);
  }
}
