import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { CampaignRecipientFilterInput } from './campaign-recipient.inputs';
import { CampaignRecipient, CampaignRecipientPage } from './campaign-recipient.types';
import { CampaignRecipientsService } from './campaign-recipients.service';

@Resolver(() => CampaignRecipient)
export class CampaignRecipientsResolver {
  constructor(
    private readonly recipients: CampaignRecipientsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => CampaignRecipientPage)
  campaignRecipients(
    @Args('campaignId', { type: () => Int }) campaignId: number,
    @Args('filter', { nullable: true }) filter?: CampaignRecipientFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<CampaignRecipientPage> {
    return this.recipients.list(this.organizationId(), campaignId, filter, page);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
