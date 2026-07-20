import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { UpdateInvoiceSettingsInput } from './invoice-settings.inputs';
import { InvoiceSettingsService } from './invoice-settings.service';
import { InvoiceSettings } from './invoice-settings.types';
import { InvoiceLogoRemovalResult } from '../invoice-logo-cleanup/invoice-logo-cleanup.types';

@Resolver(() => InvoiceSettings)
export class InvoiceSettingsResolver {
  constructor(
    private readonly settingsService: InvoiceSettingsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => InvoiceSettings)
  invoiceSettings(): Promise<InvoiceSettings> {
    return this.settingsService.get(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceSettings)
  updateInvoiceSettings(
    @Args('input') input: UpdateInvoiceSettingsInput,
  ): Promise<InvoiceSettings> {
    return this.settingsService.update(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceLogoRemovalResult)
  removeInvoiceSettingsLogo(): Promise<InvoiceLogoRemovalResult> {
    return this.settingsService.removeLogo(this.organizationId());
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
