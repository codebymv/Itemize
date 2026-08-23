import { Module } from '@nestjs/common';
import { PublicSharingController } from './public-sharing.controller';
import { PublicSharingRepository } from './public-sharing.repository';
import { PublicSharingService } from './public-sharing.service';

@Module({
  controllers: [PublicSharingController],
  providers: [PublicSharingService, PublicSharingRepository],
})
export class PublicSharingModule {}
