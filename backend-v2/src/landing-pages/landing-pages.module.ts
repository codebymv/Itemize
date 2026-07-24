import { Module } from '@nestjs/common';
import { LandingPagesRepository } from './landing-pages.repository';
import { LandingPagesResolver } from './landing-pages.resolver';
import { LandingPagesService } from './landing-pages.service';

@Module({
  providers: [
    LandingPagesRepository,
    LandingPagesService,
    LandingPagesResolver,
  ],
})
export class LandingPagesModule {}
