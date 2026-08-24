import { Module } from '@nestjs/common';
import { GetStartedModule } from '../get-started/get-started.module';
import { DealsRepository } from './deals.repository';
import { DealsResolver } from './deals.resolver';
import { DealsService } from './deals.service';

@Module({
  imports: [GetStartedModule],
  providers: [DealsRepository, DealsService, DealsResolver],
  exports: [DealsService],
})
export class DealsModule {}
