import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateRecurringInvoiceInput,
  RecurringInvoiceFilterInput,
  UpdateRecurringInvoiceInput,
} from './recurring-invoice.inputs';
import {
  DeleteRecurringInvoiceResult,
  RecurringInvoice,
  RecurringInvoicePage,
} from './recurring-invoice.types';
import { RecurringInvoicesService } from './recurring-invoices.service';

@Resolver(() => RecurringInvoice)
export class RecurringInvoicesResolver {
  constructor(
    private readonly recurringInvoices: RecurringInvoicesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => RecurringInvoicePage, { name: 'recurringInvoices' })
  list(
    @Args('filter', { nullable: true }) filter?: RecurringInvoiceFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<RecurringInvoicePage> {
    return this.recurringInvoices.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => RecurringInvoice)
  recurringInvoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecurringInvoice)
  createRecurringInvoice(
    @Args('input') input: CreateRecurringInvoiceInput,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.create(
      this.organizationId(), this.userId(), input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecurringInvoice)
  updateRecurringInvoice(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateRecurringInvoiceInput,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteRecurringInvoiceResult)
  deleteRecurringInvoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteRecurringInvoiceResult> {
    return this.recurringInvoices.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
