import { AuthModule } from '../auth/auth.module';
import { DeliveryReconciliationService } from './delivery-reconciliation.service';
import { DeliveryReconciliationResolver } from './delivery-reconciliation.resolver';
import { Module } from '@nestjs/common';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminOperationsRepository } from './admin-operations.repository';
import { AdminOperationsResolver } from './admin-operations.resolver';
import { AdminOperationsService } from './admin-operations.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [DeliveryReconciliationService, DeliveryReconciliationResolver, AdminAccessGuard, AdminOperationsRepository, AdminOperationsService, AdminOperationsResolver],
  exports: [AdminAccessGuard, AuthModule],
})
export class AdminOperationsModule {}
