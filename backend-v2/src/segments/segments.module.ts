import { Module } from '@nestjs/common';
import { SegmentsRepository } from './segments.repository';
import { SegmentsResolver } from './segments.resolver';
import { SegmentsService } from './segments.service';

@Module({
  providers: [SegmentsRepository, SegmentsService, SegmentsResolver],
  exports: [SegmentsService],
})
export class SegmentsModule {}
