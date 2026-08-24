import { Module } from '@nestjs/common';
import { PipelinesRepository } from './pipelines.repository';
import { PipelinesResolver } from './pipelines.resolver';
import { PipelinesService } from './pipelines.service';

@Module({
  providers: [PipelinesRepository, PipelinesService, PipelinesResolver],
  exports: [PipelinesService],
})
export class PipelinesModule {}
