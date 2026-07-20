import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateInvoiceInput,
  InvoiceFilterInput,
  PreviewInvoiceEmailInput,
  SendInvoiceInput,
  UpdateInvoiceInput,
} from './invoice.inputs';
import {
  DeleteInvoiceResult,
  Invoice,
  InvoiceEmailPreview,
  InvoicePage,
} from './invoice.types';
import { InvoiceEmailPreviewService } from './invoice-email-preview.service';
import { InvoiceEmailDeliveryService } from './invoice-email-delivery.service';
import { InvoiceSendResult } from './invoice-email-delivery.types';
import { InvoicesService } from './invoices.service';

@Resolver(() => Invoice)
export class InvoicesResolver {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly emailPreview: InvoiceEmailPreviewService,
    private readonly emailDelivery: InvoiceEmailDeliveryService,
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

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceEmailPreview)
  previewInvoiceEmail(
    @Args('input') input: PreviewInvoiceEmailInput,
  ): InvoiceEmailPreview {
    this.organizationId();
    return this.emailPreview.preview(input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => InvoiceSendResult)
  sendInvoice(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: SendInvoiceInput,
  ): Promise<InvoiceSendResult> {
    return this.emailDelivery.send(
      this.organizationId(), this.userId(), id, input,
    );
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
