import { Module } from '@nestjs/common';
import { RealtimeOutboxService } from './realtime-outbox.service';

@Module({
  providers: [RealtimeOutboxService],
  exports: [RealtimeOutboxService],
})
export class RealtimeOutboxModule {}
