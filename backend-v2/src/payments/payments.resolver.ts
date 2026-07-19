import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  Payment,
  PaymentMethod,
  PaymentPage,
  PaymentStatus,
  RecordPaymentResult,
} from './payment.types';
import { PaymentsService } from './payments.service';
import {
  RecordInvoicePaymentInput,
  RecordPaymentInput,
} from './payment.inputs';

@Resolver(() => Payment)
export class PaymentsResolver {
  constructor(
    private readonly paymentService: PaymentsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => PaymentPage)
  payments(
    @Args('page', { nullable: true }) page?: PageInput,
    @Args('status', { type: () => PaymentStatus, nullable: true })
    status?: PaymentStatus,
    @Args('paymentMethod', { type: () => PaymentMethod, nullable: true })
    paymentMethod?: PaymentMethod,
  ): Promise<PaymentPage> {
    return this.paymentService.list(
      this.organizationId(),
      page,
      status,
      paymentMethod,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecordPaymentResult)
  recordPayment(
    @Args('input') input: RecordPaymentInput,
  ): Promise<RecordPaymentResult> {
    return this.paymentService.record(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RecordPaymentResult)
  recordInvoicePayment(
    @Args('invoiceId', { type: () => Int }) invoiceId: number,
    @Args('input') input: RecordInvoicePaymentInput,
  ): Promise<RecordPaymentResult> {
    return this.paymentService.recordInvoice(
      this.organizationId(),
      invoiceId,
      input,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
