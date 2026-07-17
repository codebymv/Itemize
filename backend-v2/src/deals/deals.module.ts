import { Module } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { DealsResolver } from './deals.resolver';
import { DealsService } from './deals.service';

@Module({
  providers: [DealsRepository, DealsService, DealsResolver],
  exports: [DealsService],
})
export class DealsModule {}
