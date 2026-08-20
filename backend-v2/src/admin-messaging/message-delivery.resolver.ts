import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  EnqueueContactEmailInput,
  EnqueueContactSmsInput,
  SendEmailTemplateTestInput,
  SendSmsTemplateTestInput,
} from './message-delivery.inputs';
import { MessageDeliveryService } from './message-delivery.service';
import { MessageDelivery } from './message-delivery.types';

@RequiresPlan()
@Resolver()
export class MessageDeliveryResolver {
  constructor(
    private readonly delivery: MessageDeliveryService,
    private readonly requestContext: RequestContextService,
  ) {}

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => MessageDelivery)
  enqueueContactEmail(
    @Args('input') input: EnqueueContactEmailInput,
  ): Promise<MessageDelivery> {
    return this.delivery.enqueueContactEmail(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => MessageDelivery)
  enqueueContactSms(
    @Args('input') input: EnqueueContactSmsInput,
  ): Promise<MessageDelivery> {
    return this.delivery.enqueueContactSms(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => MessageDelivery)
  sendEmailTemplateTest(
    @Args('input') input: SendEmailTemplateTestInput,
  ): Promise<MessageDelivery> {
    return this.delivery.sendEmailTemplateTest(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => MessageDelivery)
  sendSmsTemplateTest(
    @Args('input') input: SendSmsTemplateTestInput,
  ): Promise<MessageDelivery> {
    return this.delivery.sendSmsTemplateTest(
      this.organizationId(),
      this.userId(),
      input,
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
