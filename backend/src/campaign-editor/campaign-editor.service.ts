import { Injectable } from '@nestjs/common';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PageInput } from '../common/pagination';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { SegmentsService } from '../segments/segments.service';
import { CampaignEditorBootstrap } from './campaign-editor.types';

const page = (pageNumber: number): PageInput =>
  Object.assign(new PageInput(), { page: pageNumber, pageSize: 100 });

@Injectable()
export class CampaignEditorService {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly templates: EmailTemplatesService,
    private readonly segments: SegmentsService,
  ) {}

  async bootstrap(
    organizationId: number,
    campaignId?: number | null,
  ): Promise<CampaignEditorBootstrap> {
    const campaign = campaignId == null
      ? null
      : await this.campaigns.detail(organizationId, campaignId);
    const [templates, segments, filterOptions] = await Promise.all([
      campaign?.templateId
        ? this.templates.detail(organizationId, campaign.templateId).then((template) => [template])
        : Promise.resolve([]),
      this.availableSegments(organizationId, campaign?.segmentId ?? null),
      this.segments.filterOptions(organizationId),
    ]);
    const audiencePreview = campaign
      && (campaign.status === 'draft' || campaign.status === 'scheduled')
      ? await this.campaigns.audiencePreview(organizationId, campaign.id)
      : null;

    return { campaign, templates, segments, filterOptions, audiencePreview };
  }

  private async availableSegments(organizationId: number, selectedId: number | null) {
    const result = await this.segments.list(
      organizationId,
      { isActive: true },
      page(1),
    );
    if (!selectedId || result.nodes.some((segment) => segment.id === selectedId)) {
      return result.nodes;
    }
    const selected = await this.segments.get(organizationId, selectedId);
    return [...result.nodes, selected];
  }
}
