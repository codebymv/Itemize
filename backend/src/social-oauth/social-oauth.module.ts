import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionOrganizationGuard } from '../common/session-organization.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  FACEBOOK_GRAPH_CLIENT,
  HttpFacebookGraphClient,
} from './facebook-graph.provider';
import { SocialOAuthController } from './social-oauth.controller';
import { SocialOAuthRepository } from './social-oauth.repository';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [SocialOAuthController],
  providers: [
    SessionOrganizationGuard,
    SocialOAuthRepository,
    { provide: FACEBOOK_GRAPH_CLIENT, useClass: HttpFacebookGraphClient },
  ],
})
export class SocialOAuthModule {}
