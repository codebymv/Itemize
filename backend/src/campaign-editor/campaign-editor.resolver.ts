import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CampaignEditorService } from './campaign-editor.service';
import { CampaignEditorBootstrap } from './campaign-editor.types';

@RequiresPlan()
@Resolver()
export class CampaignEditorResolver {
  constructor(
    private readonly editor: CampaignEditorService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => CampaignEditorBootstrap)
  campaignEditorBootstrap(
    @Args('campaignId', { type: () => Int, nullable: true }) campaignId?: number,
  ): Promise<CampaignEditorBootstrap> {
    return this.editor.bootstrap(this.organizationId(), campaignId);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }
}
