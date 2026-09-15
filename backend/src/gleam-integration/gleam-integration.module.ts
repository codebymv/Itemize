import { Module } from '@nestjs/common';
import { GleamIntegrationController } from './gleam-integration.controller';
import { GleamIntegrationGuard } from './gleam-integration.guard';
import { GleamHandoffReceiverService } from './gleam-handoff-receiver.service';
import { GleamPairingService } from './gleam-pairing.service';
import { GleamPairingController } from './gleam-pairing.controller';
import { GleamPairingResolver } from './gleam-pairing.resolver';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:[NotificationsModule],
  controllers:[GleamIntegrationController,GleamPairingController],
  providers:[GleamIntegrationGuard,GleamHandoffReceiverService,GleamPairingService,GleamPairingResolver],
})
export class GleamIntegrationModule {}
