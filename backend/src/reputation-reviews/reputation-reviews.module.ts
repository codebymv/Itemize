import { Module } from '@nestjs/common';
import { ReputationReviewsRepository } from './reputation-reviews.repository';
import { ReputationReviewsResolver } from './reputation-reviews.resolver';
import { ReputationReviewsService } from './reputation-reviews.service';

@Module({
  providers: [ReputationReviewsRepository, ReputationReviewsService, ReputationReviewsResolver],
})
export class ReputationReviewsModule {}
