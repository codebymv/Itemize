import { Module } from '@nestjs/common';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingResolver } from './onboarding.resolver';
import { OnboardingService } from './onboarding.service';

@Module({
  providers: [OnboardingRepository, OnboardingService, OnboardingResolver],
})
export class OnboardingModule {}
