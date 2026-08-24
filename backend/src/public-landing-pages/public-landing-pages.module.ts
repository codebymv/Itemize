import { Module } from '@nestjs/common';
import { PublicLandingPagesController } from './public-landing-pages.controller';
import { PublicLandingPagesRepository } from './public-landing-pages.repository';
import { PublicLandingPagesService } from './public-landing-pages.service';

@Module({
  controllers: [PublicLandingPagesController],
  providers: [PublicLandingPagesService, PublicLandingPagesRepository],
})
export class PublicLandingPagesModule {}
