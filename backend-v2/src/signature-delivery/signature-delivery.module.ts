import { Module } from '@nestjs/common';
import { SignatureDeliveryRepository } from './signature-delivery.repository';
import { SignatureDeliveryResolver } from './signature-delivery.resolver';
import { SignatureDeliveryService } from './signature-delivery.service';

@Module({
  providers: [SignatureDeliveryRepository, SignatureDeliveryService, SignatureDeliveryResolver],
})
export class SignatureDeliveryModule {}
