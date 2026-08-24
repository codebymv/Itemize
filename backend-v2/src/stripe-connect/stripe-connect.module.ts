import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionOrganizationGuard } from '../common/session-organization.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StripeConnectController } from './stripe-connect.controller';
import {
  HttpStripeConnectClient,
  STRIPE_CONNECT_CLIENT,
} from './stripe-connect.provider';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [StripeConnectController],
  providers: [
    SessionOrganizationGuard,
    { provide: STRIPE_CONNECT_CLIENT, useClass: HttpStripeConnectClient },
  ],
})
export class StripeConnectModule {}
