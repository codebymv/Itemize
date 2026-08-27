import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';
import { AuthRepository } from './auth.repository';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthResolver } from './auth.resolver';
import { AuthEmailService } from './auth-email.service';
import { GraphqlAuthGuard } from './graphql-auth.guard';
import { GraphqlCsrfGuard } from './graphql-csrf.guard';
import { SessionService } from './session.service';
import { IdentityLifecycleService } from './identity-lifecycle.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountDataExportRepository } from './account-data-export.repository';
import { AccountDataExportService } from './account-data-export.service';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionSchedulerService } from './account-deletion-scheduler.service';

@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  providers: [
    AccountDeletionRepository,
    AccountDeletionService,
    AccountDeletionSchedulerService,
    AccountDataExportRepository,
    AccountDataExportService,
    AccessTokenService,
    AuthEmailService,
    AuthRepository,
    AuthRateLimitService,
    AuthResolver,
    GraphqlAuthGuard,
    GraphqlCsrfGuard,
    IdentityLifecycleService,
    SessionService,
  ],
  exports: [AccessTokenService, GraphqlAuthGuard, GraphqlCsrfGuard],
})
export class AuthModule {}
