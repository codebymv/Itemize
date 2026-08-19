import { Module } from '@nestjs/common';
import { GetStartedRepository } from './get-started.repository';
import { GetStartedResolver } from './get-started.resolver';
import { GetStartedService } from './get-started.service';

@Module({
  providers: [GetStartedRepository, GetStartedService, GetStartedResolver],
  exports: [GetStartedService],
})
export class GetStartedModule {}
