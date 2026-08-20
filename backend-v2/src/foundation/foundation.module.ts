import { Module } from '@nestjs/common';
import { FoundationResolver } from './foundation.resolver';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController], providers: [FoundationResolver] })
export class FoundationModule {}
