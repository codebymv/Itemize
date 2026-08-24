import { Module } from '@nestjs/common';
import { ReputationConfigurationRepository } from './reputation-configuration.repository';
import { ReputationConfigurationResolver } from './reputation-configuration.resolver';
import { ReputationConfigurationService } from './reputation-configuration.service';

@Module({
  providers: [
    ReputationConfigurationRepository,
    ReputationConfigurationService,
    ReputationConfigurationResolver,
  ],
})
export class ReputationConfigurationModule {}
