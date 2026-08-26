import { Module } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { StripeRefundProvider } from './stripe-refund.provider';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [PaymentsRepository, PaymentsService, PaymentsResolver, StripeRefundProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
