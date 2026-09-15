import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { HttpIntegrationScoped } from '../common/metadata';
import { Header } from '@nestjs/common';
import { GleamIntegrationGuard, GleamRequest, GleamScopeRequired } from './gleam-integration.guard';
import { GleamHandoffReceiverService } from './gleam-handoff-receiver.service';
import { gleamError } from './gleam-errors';
import { GleamPairingService } from './gleam-pairing.service';

@HttpIntegrationScoped()
@UseGuards(GleamIntegrationGuard)
@Controller('api/integrations/gleam')
export class GleamIntegrationController {
  constructor(private readonly receiver: GleamHandoffReceiverService, private readonly pairing: GleamPairingService) {}

  @Get('connection')
  @GleamScopeRequired('connection:read')
  connection(@Req() request: GleamRequest) {
    if (!request.gleam) gleamError(401,'INVALID_CREDENTIAL');
    return this.pairing.connectionStatus(request.gleam);
  }

  @Post('handoffs')
  @HttpCode(200)
  @GleamScopeRequired('handoffs:write')
  receive(@Req() request: GleamRequest, @Body() event: unknown) {
    if (!request.gleam) gleamError(401,'INVALID_CREDENTIAL');
    return this.receiver.receive(request.gleam,event);
  }

  @Get('receipts/:eventId')
  @GleamScopeRequired('receipts:read')
  receipt(@Req() request: GleamRequest, @Param('eventId') eventId: string) {
    if (!request.gleam) gleamError(401,'INVALID_CREDENTIAL');
    return this.receiver.receipt(request.gleam,eventId);
  }

  @Get('tasks/:eventId')
  @Header('Cache-Control', 'no-store')
  @GleamScopeRequired('task-status:read')
  taskStatus(@Req() request: GleamRequest, @Param('eventId') eventId: string) {
    if (!request.gleam) gleamError(401,'INVALID_CREDENTIAL');
    return this.receiver.taskStatus(request.gleam,eventId);
  }

  @Post('handoffs/:eventId/notify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @GleamScopeRequired('notifications:write')
  notifyAssignee(@Req() request: GleamRequest, @Param('eventId') eventId: string) {
    if (!request.gleam) gleamError(401,'INVALID_CREDENTIAL');
    return this.receiver.notifyAssignee(request.gleam,eventId);
  }
}
