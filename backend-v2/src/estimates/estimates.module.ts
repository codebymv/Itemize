import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module';
import { EstimatesRepository } from './estimates.repository';
import { EstimatesResolver } from './estimates.resolver';
import { EstimatesService } from './estimates.service';
import { EstimateEmailDeliveryService } from './estimate-email-delivery.service';
import {
  ESTIMATE_EMAIL_PROVIDER,
  ResendEstimateEmailProvider,
} from './estimate-email.provider';
import { EstimatePublicController } from './estimate-public.controller';
import { EstimatePublicRepository } from './estimate-public.repository';
import { EstimatePublicService } from './estimate-public.service';

@Module({
  imports: [ActivationModule],
  controllers: [EstimatePublicController],
  providers: [
    EstimatesRepository,
    EstimatePublicRepository,
    EstimatesService,
    EstimatePublicService,
    EstimateEmailDeliveryService,
    EstimatesResolver,
    ResendEstimateEmailProvider,
    {
      provide: ESTIMATE_EMAIL_PROVIDER,
      useExisting: ResendEstimateEmailProvider,
    },
  ],
  exports: [EstimatesService, EstimateEmailDeliveryService],
})
export class EstimatesModule {}
