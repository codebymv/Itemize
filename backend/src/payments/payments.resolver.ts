import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, RequiresPlan } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { itemizeGraphqlError } from '../common/graphql-error';
import { RequestContextService } from '../request-context/request-context.service';
import {
  Payment,
  PaymentMethod,
  PaymentOverview,
  PaymentPage,
  PaymentPeriod,
  PaymentStatus,
  RevenueFlow,
  RecordPaymentResult,
  RefundPaymentResult,
} from './payment.types';
import { PaymentsService } from './payments.service';
import {
  RecordInvoicePaymentInput,
  RecordPaymentInput,
  RefundPaymentInput,
} from './payment.inputs';

@RequiresPlan()
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
    @Args('period', {
      type: () => PaymentPeriod,
      defaultValue: PaymentPeriod.LAST_30_DAYS,
    })
    period?: PaymentPeriod,
    @Args('status', { type: () => PaymentStatus, nullable: true })
    status?: PaymentStatus,
    @Args('paymentMethod', { type: () => PaymentMethod, nullable: true })
    paymentMethod?: PaymentMethod,
    @Args('search', { type: () => String, nullable: true })
    search?: string,
  ): Promise<PaymentPage> {
    return this.paymentService.list(
      this.organizationId(),
      page,
      period,
      status,
      paymentMethod,
      search,
    );
  }

  @OrganizationScoped()
  @Query(() => PaymentOverview)
  paymentOverview(
    @Args('period', {
      type: () => PaymentPeriod,
      defaultValue: PaymentPeriod.LAST_30_DAYS,
    })
    period?: PaymentPeriod,
  ): Promise<PaymentOverview> {
    return this.paymentService.overview(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => RevenueFlow)
  revenueFlow(
    @Args('period', {
      type: () => PaymentPeriod,
      defaultValue: PaymentPeriod.LAST_30_DAYS,
    })
    period?: PaymentPeriod,
  ): Promise<RevenueFlow> {
    return this.paymentService.revenueFlow(this.organizationId(), period);
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

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => RefundPaymentResult)
  refundPayment(
    @Args('paymentId', { type: () => Int }) paymentId: number,
    @Args('input') input: RefundPaymentInput,
  ): Promise<RefundPaymentResult> {
    return this.paymentService.refund(this.financialOrganizationId(), paymentId, input);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private financialOrganizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    if (!['owner', 'admin'].includes(organization.organizationRole.toLowerCase())) {
      throw itemizeGraphqlError(
        'Only organization owners and admins can issue refunds',
        'FORBIDDEN',
        { reason: 'PAYMENT_REFUND_ROLE_REQUIRED' },
      );
    }
    return organization.organizationId;
  }
}
