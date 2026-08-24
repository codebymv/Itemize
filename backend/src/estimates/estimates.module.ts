import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module';
import { EstimatesRepository } from './estimates.repository';
import { EstimatesResolver } from './estimates.resolver';
import { EstimatesService } from './estimates.service';
import { EstimateEmailDeliveryService } from './estimate-email-delivery.service';
import { EstimateEmailDeliverySchedulerService } from './estimate-email-delivery-scheduler.service';
import {
  ESTIMATE_EMAIL_PROVIDER,
  ResendEstimateEmailProvider,
} from './estimate-email.provider';
import { EstimatePublicController } from './estimate-public.controller';
import { EstimatePublicRepository } from './estimate-public.repository';
import { EstimatePublicService } from './estimate-public.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ActivationModule, NotificationsModule],
  controllers: [EstimatePublicController],
  providers: [
    EstimatesRepository,
    EstimatePublicRepository,
    EstimatesService,
    EstimatePublicService,
    EstimateEmailDeliveryService,
    EstimateEmailDeliverySchedulerService,
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
