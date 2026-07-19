import { Module } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';

@Module({
  providers: [PaymentsRepository, PaymentsService, PaymentsResolver],
  exports: [PaymentsService],
})
export class PaymentsModule {}
