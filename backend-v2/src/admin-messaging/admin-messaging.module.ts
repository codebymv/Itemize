import { Module } from '@nestjs/common';
import { AdminOperationsModule } from '../admin-operations/admin-operations.module';
import { AdminMessagingRepository } from './admin-messaging.repository';
import { AdminMessagingResolver } from './admin-messaging.resolver';
import { AdminMessagingService } from './admin-messaging.service';

@Module({
  imports: [AdminOperationsModule],
  providers: [
    AdminMessagingRepository, AdminMessagingService, AdminMessagingResolver,
  ],
})
export class AdminMessagingModule {}
