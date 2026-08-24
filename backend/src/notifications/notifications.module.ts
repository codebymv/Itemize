import { Module } from '@nestjs/common';
import { RealtimeOutboxModule } from '../realtime-outbox/realtime-outbox.module';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [RealtimeOutboxModule],
  providers: [NotificationsRepository, NotificationsService, NotificationsResolver],
  exports: [NotificationsService],
})
export class NotificationsModule {}
