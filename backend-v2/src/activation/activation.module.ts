import { Module } from '@nestjs/common';
import { ActivationRepository } from './activation.repository';
import { ActivationService } from './activation.service';

@Module({
  providers: [ActivationRepository, ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
