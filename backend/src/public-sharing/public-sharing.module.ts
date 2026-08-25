import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicSharingController } from './public-sharing.controller';
import { PublicSharingRepository } from './public-sharing.repository';
import { PublicSharingService } from './public-sharing.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PublicSharingController],
  providers: [PublicSharingService, PublicSharingRepository],
})
export class PublicSharingModule {}
