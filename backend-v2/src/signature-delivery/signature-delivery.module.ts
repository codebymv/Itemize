import { Module } from '@nestjs/common';
import { SignatureDocumentsModule } from '../signature-documents/signature-documents.module';
import { WorkflowJobsModule } from '../workflow-jobs/workflow-jobs.module';
import { SignatureDeliveryJobsRepository } from './signature-delivery-jobs.repository';
import { SignatureDeliveryJobsService } from './signature-delivery-jobs.service';
import { SignatureDeliveryRepository } from './signature-delivery.repository';
import { SignatureDeliveryResolver } from './signature-delivery.resolver';
import { SignatureDeliveryService } from './signature-delivery.service';

@Module({
  imports: [SignatureDocumentsModule, WorkflowJobsModule],
  providers: [
    SignatureDeliveryRepository,
    SignatureDeliveryService,
    SignatureDeliveryResolver,
    SignatureDeliveryJobsRepository,
    SignatureDeliveryJobsService,
  ],
  exports: [
    SignatureDeliveryRepository,
    SignatureDeliveryService,
    SignatureDeliveryJobsRepository,
    SignatureDeliveryJobsService,
  ],
})
export class SignatureDeliveryModule {}
