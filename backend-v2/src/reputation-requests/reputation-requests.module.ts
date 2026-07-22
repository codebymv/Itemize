import { Module } from '@nestjs/common';
import { ReputationRequestsRepository } from './reputation-requests.repository';
import { ReputationRequestsResolver } from './reputation-requests.resolver';
import { ReputationRequestsService } from './reputation-requests.service';
import { ReputationRequestDeliveryRepository } from './reputation-request-delivery.repository';
import { ReputationRequestDeliveryService } from './reputation-request-delivery.service';
import {
  REPUTATION_EMAIL_PROVIDER,
  REPUTATION_SMS_PROVIDER,
  ResendReputationEmailProvider,
  TwilioReputationSmsProvider,
} from './reputation-request-delivery.providers';

@Module({
  providers: [
    ReputationRequestsRepository,
    ReputationRequestsService,
    ReputationRequestsResolver,
    ReputationRequestDeliveryRepository,
    ReputationRequestDeliveryService,
    ResendReputationEmailProvider,
    TwilioReputationSmsProvider,
    { provide: REPUTATION_EMAIL_PROVIDER, useExisting: ResendReputationEmailProvider },
    { provide: REPUTATION_SMS_PROVIDER, useExisting: TwilioReputationSmsProvider },
  ],
  exports: [ReputationRequestDeliveryService],
})
export class ReputationRequestsModule {}
