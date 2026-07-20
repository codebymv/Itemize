import { Module } from '@nestjs/common';
import { EstimatesRepository } from './estimates.repository';
import { EstimatesResolver } from './estimates.resolver';
import { EstimatesService } from './estimates.service';
import { EstimateEmailDeliveryService } from './estimate-email-delivery.service';
import {
  ESTIMATE_EMAIL_PROVIDER,
  ResendEstimateEmailProvider,
} from './estimate-email.provider';

@Module({
  providers: [
    EstimatesRepository,
    EstimatesService,
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
