import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AdminAccessGuard } from '../admin-operations/admin-access.guard';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AdminEmailBatchInput } from './admin-messaging.inputs';
import { AdminEmailBatchResult } from './admin-messaging.types';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';

@UseGuards(AdminAccessGuard)
@Resolver()
export class AdminEmailDeliveryResolver {
  constructor(private readonly delivery: AdminEmailDeliveryService, private readonly requestContext: RequestContextService) {}

  @CsrfProtected()
  @Mutation(() => AdminEmailBatchResult)
  enqueueAdminEmailBatch(@Args('input') input: AdminEmailBatchInput): Promise<AdminEmailBatchResult> {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return this.delivery.enqueue(identity.userId, input);
  }
}
