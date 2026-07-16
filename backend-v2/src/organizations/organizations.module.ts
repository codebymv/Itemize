import { Module } from '@nestjs/common';
import { OrganizationContextGuard } from './organization-context.guard';
import { OrganizationContextService } from './organization-context.service';

@Module({
  providers: [OrganizationContextService, OrganizationContextGuard],
  exports: [OrganizationContextService, OrganizationContextGuard],
})
export class OrganizationsModule {}
