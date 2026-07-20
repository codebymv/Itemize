import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateRecurringInvoiceFromInvoiceInput,
  CreateRecurringInvoiceInput,
  RecurringInvoiceFilterInput,
  UpdateRecurringInvoiceInput,
} from './recurring-invoice.inputs';
import {
  DeleteRecurringInvoiceResult,
  RecurringInvoice,
  RecurringInvoiceGenerationResult,
  RecurringInvoiceHistoryPage,
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

  @OrganizationScoped()
  @Query(() => String)
  previewRecurringInvoiceNumber(): Promise<string> {
    return this.recurringInvoices.previewInvoiceNumber(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => RecurringInvoiceHistoryPage)
  recurringInvoiceHistory(
    @Args('id', { type: () => Int }) id: number,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<RecurringInvoiceHistoryPage> {
    return this.recurringInvoices.history(this.organizationId(), id, page);
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
  createRecurringInvoiceFromInvoice(
    @Args('invoiceId', { type: () => Int }) invoiceId: number,
    @Args('input') input: CreateRecurringInvoiceFromInvoiceInput,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.createFromInvoice(
      this.organizationId(), this.userId(), invoiceId, input,
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

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecurringInvoice)
  pauseRecurringInvoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.pause(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecurringInvoice)
  resumeRecurringInvoice(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<RecurringInvoice> {
    return this.recurringInvoices.resume(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecurringInvoiceGenerationResult)
  generateRecurringInvoiceNow(
    @Args('id', { type: () => Int }) id: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<RecurringInvoiceGenerationResult> {
    return this.recurringInvoices.generateNow(
      this.organizationId(), this.userId(), id, idempotencyKey,
    );
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
