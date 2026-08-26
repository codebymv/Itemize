import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StripeConnectController } from './stripe-connect.controller';
import {
  HttpStripeConnectClient,
  STRIPE_CONNECT_CLIENT,
} from './stripe-connect.provider';
import { StripeConnectResolver } from './stripe-connect.resolver';
import { StripeConnectService } from './stripe-connect.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [StripeConnectController],
  providers: [
    StripeConnectService,
    StripeConnectResolver,
    { provide: STRIPE_CONNECT_CLIENT, useClass: HttpStripeConnectClient },
  ],
})
export class StripeConnectModule {}
