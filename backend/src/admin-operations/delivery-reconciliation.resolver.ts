import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { CsrfProtected, PlatformAdminScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AdminAccessGuard } from './admin-access.guard';
import { DeliveryReconciliationService } from './delivery-reconciliation.service';
@UseGuards(AdminAccessGuard)
@PlatformAdminScoped()
@Resolver()
export class DeliveryReconciliationResolver {
  constructor(private readonly service:DeliveryReconciliationService, private readonly context:RequestContextService) {}
  @CsrfProtected()
  @Mutation(()=>Boolean)
  reconcileEmailDelivery(@Args('source') source:string,@Args('deliveryId',{type:()=>Int}) deliveryId:number,@Args('providerId') providerId:string) {
    const identity=this.context.current().identity;
    if(!identity) throw new Error('Verified identity unavailable');
    return this.service.reconcile(identity.userId,source,deliveryId,providerId);
  }
}
