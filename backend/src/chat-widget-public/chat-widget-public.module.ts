import { Module } from '@nestjs/common';
import { RealtimeHostModule } from '../realtime-host/realtime-host.module';
import { ChatWidgetPublicController } from './chat-widget-public.controller';
import { ChatWidgetPublicRepository } from './chat-widget-public.repository';

@Module({
  imports: [RealtimeHostModule],
  controllers: [ChatWidgetPublicController],
  providers: [ChatWidgetPublicRepository],
})
export class ChatWidgetPublicModule {}
