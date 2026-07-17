import { Module } from '@nestjs/common';
import { TagsRepository } from './tags.repository';
import { TagsResolver } from './tags.resolver';
import { TagsService } from './tags.service';

@Module({
  providers: [TagsRepository, TagsService, TagsResolver],
  exports: [TagsService],
})
export class TagsModule {}
