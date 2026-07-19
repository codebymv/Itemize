import { Module } from '@nestjs/common';
import { EstimatesRepository } from './estimates.repository';
import { EstimatesResolver } from './estimates.resolver';
import { EstimatesService } from './estimates.service';

@Module({
  providers: [EstimatesRepository, EstimatesService, EstimatesResolver],
  exports: [EstimatesService],
})
export class EstimatesModule {}
