import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeHostService } from './realtime-host.service';

@Module({
  imports: [AuthModule],
  providers: [RealtimeHostService],
  exports: [RealtimeHostService],
})
export class RealtimeHostModule {}
