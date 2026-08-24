import { Module } from '@nestjs/common';
import { FoundationResolver } from './foundation.resolver';
import { HealthController } from './health.controller';
import { OperationalStatusController } from './operational-status.controller';

@Module({
  controllers: [HealthController, OperationalStatusController],
  providers: [FoundationResolver],
})
export class FoundationModule {}
