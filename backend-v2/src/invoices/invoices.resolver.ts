import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateInvoiceInput,
  InvoiceFilterInput,
  UpdateInvoiceInput,
} from './invoice.inputs';
import {
  DeleteInvoiceResult,
  Invoice,
  InvoicePage,
} from './invoice.types';
import { InvoicesService } from './invoices.service';

@Resolver(() => Invoice)
export class InvoicesResolver {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => InvoicePage, { name: 'invoices' })
  invoicePage(
    @Args('filter', { nullable: true }) filter?: InvoiceFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<InvoicePage> {
    return this.invoices.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => Invoice)
  invoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Invoice> {
    return this.invoices.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Invoice)
  createInvoice(
    @Args('input') input: CreateInvoiceInput,
  ): Promise<Invoice> {
    return this.invoices.create(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Invoice)
  updateInvoice(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateInvoiceInput,
  ): Promise<Invoice> {
    return this.invoices.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteInvoiceResult)
  deleteInvoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteInvoiceResult> {
    return this.invoices.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
