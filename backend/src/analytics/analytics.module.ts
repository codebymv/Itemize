import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ActivationModule],
  providers: [AnalyticsRepository, AnalyticsService, AnalyticsResolver],
})
export class AnalyticsModule {}
