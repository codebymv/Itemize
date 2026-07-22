import { Module } from '@nestjs/common';
import { ReputationRequestsRepository } from './reputation-requests.repository';
import { ReputationRequestsResolver } from './reputation-requests.resolver';
import { ReputationRequestsService } from './reputation-requests.service';

@Module({
  providers: [ReputationRequestsRepository, ReputationRequestsService, ReputationRequestsResolver],
})
export class ReputationRequestsModule {}
