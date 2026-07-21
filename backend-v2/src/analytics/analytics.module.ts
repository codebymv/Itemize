import { Module } from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService } from './analytics.service';

@Module({
  providers: [AnalyticsRepository, AnalyticsService, AnalyticsResolver],
})
export class AnalyticsModule {}
