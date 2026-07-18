import { Module } from '@nestjs/common';
import { OrganizationContextGuard } from './organization-context.guard';
import { OrganizationContextService } from './organization-context.service';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsResolver } from './organizations.resolver';
import { OrganizationsService } from './organizations.service';

@Module({
  providers: [
    OrganizationContextService,
    OrganizationContextGuard,
    OrganizationsRepository,
    OrganizationsService,
    OrganizationsResolver,
  ],
  exports: [OrganizationContextService, OrganizationContextGuard],
})
export class OrganizationsModule {}
