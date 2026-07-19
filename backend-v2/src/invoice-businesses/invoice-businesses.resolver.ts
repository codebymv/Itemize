import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateInvoiceBusinessInput,
  UpdateInvoiceBusinessInput,
} from './invoice-business.inputs';
import {
  DeleteInvoiceBusinessResult,
  InvoiceBusiness,
  InvoiceBusinessPage,
} from './invoice-business.types';
import { InvoiceBusinessesService } from './invoice-businesses.service';

@Resolver(() => InvoiceBusiness)
export class InvoiceBusinessesResolver {
  constructor(
    private readonly businessService: InvoiceBusinessesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => InvoiceBusinessPage)
  invoiceBusinesses(
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<InvoiceBusinessPage> {
    return this.businessService.list(this.organizationId(), page);
  }

  @OrganizationScoped()
  @Query(() => InvoiceBusiness)
  invoiceBusiness(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<InvoiceBusiness> {
    return this.businessService.find(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceBusiness)
  createInvoiceBusiness(
    @Args('input') input: CreateInvoiceBusinessInput,
  ): Promise<InvoiceBusiness> {
    return this.businessService.create(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceBusiness)
  updateInvoiceBusiness(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateInvoiceBusinessInput,
  ): Promise<InvoiceBusiness> {
    return this.businessService.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteInvoiceBusinessResult)
  deleteInvoiceBusiness(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteInvoiceBusinessResult> {
    return this.businessService.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
