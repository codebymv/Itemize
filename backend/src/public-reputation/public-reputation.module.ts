import { Module } from '@nestjs/common';
import { PublicReputationController } from './public-reputation.controller';
import { PublicReputationRepository } from './public-reputation.repository';
import { PublicReputationService } from './public-reputation.service';

@Module({
  controllers: [PublicReputationController],
  providers: [PublicReputationService, PublicReputationRepository],
})
export class PublicReputationModule {}
