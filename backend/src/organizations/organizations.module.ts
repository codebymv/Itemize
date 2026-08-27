import { Module } from '@nestjs/common';
import { OrganizationContextGuard } from './organization-context.guard';
import { OrganizationContextService } from './organization-context.service';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationInvitationEmailService } from './organization-invitation-email.service';
import { OrganizationInvitationsRepository } from './organization-invitations.repository';
import { OrganizationInvitationsService } from './organization-invitations.service';
import { OrganizationsResolver } from './organizations.resolver';
import { OrganizationsService } from './organizations.service';

@Module({
  providers: [
    OrganizationInvitationEmailService,
    OrganizationInvitationsRepository,
    OrganizationInvitationsService,
    OrganizationContextService,
    OrganizationContextGuard,
    OrganizationsRepository,
    OrganizationsService,
    OrganizationsResolver,
  ],
  exports: [OrganizationContextService, OrganizationContextGuard],
})
export class OrganizationsModule {}
