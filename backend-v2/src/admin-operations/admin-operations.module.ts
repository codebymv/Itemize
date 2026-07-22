import { Module } from '@nestjs/common';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminOperationsRepository } from './admin-operations.repository';
import { AdminOperationsResolver } from './admin-operations.resolver';
import { AdminOperationsService } from './admin-operations.service';

@Module({ providers: [AdminAccessGuard, AdminOperationsRepository, AdminOperationsService, AdminOperationsResolver] })
export class AdminOperationsModule {}
