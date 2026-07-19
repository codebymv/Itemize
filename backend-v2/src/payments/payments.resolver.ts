import { Args, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  Payment,
  PaymentMethod,
  PaymentPage,
  PaymentStatus,
} from './payment.types';
import { PaymentsService } from './payments.service';

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

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
