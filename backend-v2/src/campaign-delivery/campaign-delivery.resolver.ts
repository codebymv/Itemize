import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CampaignTestEmailService } from './campaign-test-email.service';
import { CampaignTestEmailResult } from './campaign-test-email.types';

@Resolver()
export class CampaignDeliveryResolver {
  constructor(
    private readonly testEmails: CampaignTestEmailService,
    private readonly requestContext: RequestContextService,
  ) {}

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => CampaignTestEmailResult)
  sendCampaignTest(
    @Args('campaignId', { type: () => Int }) campaignId: number,
    @Args('testEmail') testEmail: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<CampaignTestEmailResult> {
    return this.testEmails.send(
      this.organizationId(), this.userId(), campaignId, testEmail, idempotencyKey,
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
