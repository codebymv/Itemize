import { Module } from '@nestjs/common';
import { RealtimeOutboxModule } from '../realtime-outbox/realtime-outbox.module';
import { ChatWidgetRepository } from './chat-widget.repository';
import { ChatWidgetResolver } from './chat-widget.resolver';
import { ChatWidgetService } from './chat-widget.service';

@Module({
  imports: [RealtimeOutboxModule],
  providers: [ChatWidgetRepository, ChatWidgetService, ChatWidgetResolver],
  exports: [ChatWidgetService],
})
export class ChatWidgetModule {}
