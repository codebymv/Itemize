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
    const [campaign, templates, segments, filterOptions] = await Promise.all([
      campaignId == null
        ? Promise.resolve(null)
        : this.campaigns.detail(organizationId, campaignId),
      this.allTemplates(organizationId),
      this.allSegments(organizationId),
      this.segments.filterOptions(organizationId),
    ]);
    const audiencePreview = campaign
      && (campaign.status === 'draft' || campaign.status === 'scheduled')
      ? await this.campaigns.audiencePreview(organizationId, campaign.id)
      : null;

    return { campaign, templates, segments, filterOptions, audiencePreview };
  }

  private async allTemplates(organizationId: number) {
    const nodes = [];
    let pageNumber = 1;
    let totalPages = 1;
    do {
      const result = await this.templates.list(
        organizationId,
        {},
        page(pageNumber),
      );
      nodes.push(...result.nodes);
      totalPages = result.pageInfo.totalPages;
      pageNumber += 1;
    } while (pageNumber <= totalPages);
    return nodes;
  }

  private async allSegments(organizationId: number) {
    const nodes = [];
    let pageNumber = 1;
    let totalPages = 1;
    do {
      const result = await this.segments.list(
        organizationId,
        {},
        page(pageNumber),
      );
      nodes.push(...result.nodes);
      totalPages = result.pageInfo.totalPages;
      pageNumber += 1;
    } while (pageNumber <= totalPages);
    return nodes;
  }
}
