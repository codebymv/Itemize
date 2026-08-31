import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { RecurringInvoicePreviewService } from './recurring-invoice-preview.service';
import { RecurringInvoicePreviewBootstrap } from './recurring-invoice-preview.types';

@RequiresPlan()
@Resolver()
export class RecurringInvoicePreviewResolver {
  constructor(
    private readonly previews: RecurringInvoicePreviewService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => RecurringInvoicePreviewBootstrap)
  recurringInvoicePreviewBootstrap(
    @Args('recurringInvoiceId', { type: () => Int }) recurringInvoiceId: number,
  ): Promise<RecurringInvoicePreviewBootstrap> {
    return this.previews.bootstrap(this.organizationId(), recurringInvoiceId);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
