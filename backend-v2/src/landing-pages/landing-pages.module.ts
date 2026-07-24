import { Module } from '@nestjs/common';
import { LandingPageVersionsRepository } from './landing-page-versions.repository';
import { LandingPageVersionsResolver } from './landing-page-versions.resolver';
import { LandingPageVersionsService } from './landing-page-versions.service';
import { LandingPagesRepository } from './landing-pages.repository';
import { LandingPagesResolver } from './landing-pages.resolver';
import { LandingPagesService } from './landing-pages.service';

@Module({
  providers: [
    LandingPageVersionsRepository,
    LandingPageVersionsService,
    LandingPageVersionsResolver,
    LandingPagesRepository,
    LandingPagesService,
    LandingPagesResolver,
  ],
})
export class LandingPagesModule {}
