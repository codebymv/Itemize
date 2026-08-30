import { Module } from '@nestjs/common';
import { RealtimeHostModule } from '../realtime-host/realtime-host.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatWidgetPublicController } from './chat-widget-public.controller';
import { ChatWidgetPublicRepository } from './chat-widget-public.repository';

@Module({
  imports: [RealtimeHostModule, NotificationsModule],
  controllers: [ChatWidgetPublicController],
  providers: [ChatWidgetPublicRepository],
})
export class ChatWidgetPublicModule {}
