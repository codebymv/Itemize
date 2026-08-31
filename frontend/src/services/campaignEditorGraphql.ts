import type { EmailTemplate } from './emailApi';
import type { FilterOptions, Segment } from './segmentsApi';
import type { CampaignPreview, EmailCampaign } from './campaignsApi';
import {
  campaignFields,
  getCampaignViaGraphql,
  mapCampaign,
  previewCampaignViaGraphql,
  type GraphqlCampaign,
} from './campaignsGraphql';
import {
  emailTemplateFields,
  getEmailTemplatesViaGraphql,
  mapEmailTemplate,
  type GraphqlEmailTemplate,
} from './emailTemplatesGraphql';
import { graphqlRequest } from './graphqlClient';
import {
  getSegmentFilterOptionsViaGraphql,
  getSegmentsViaGraphql,
  mapSegment,
  mapSegmentFilterOptions,
  segmentFields,
  type GraphqlSegment,
  type GraphqlSegmentFilterOptions,
} from './segmentsGraphql';

export interface CampaignEditorBootstrapData {
  campaign: EmailCampaign | null;
  templates: EmailTemplate[];
  segments: Segment[];
  filterOptions: FilterOptions;
  audiencePreview: CampaignPreview | null;
}

type Capability = 'unknown' | 'aggregate' | 'legacy';
let capability: Capability = 'unknown';

const campaignEditorBootstrapQuery = `
  query CampaignEditorBootstrap($campaignId: Int) {
    campaignEditorBootstrap(campaignId: $campaignId) {
      campaign { ${campaignFields} }
      templates { ${emailTemplateFields} }
      segments { ${segmentFields} }
      filterOptions {
        fields { id label type operators options }
        tags { id name color }
        users { id name }
        pipelines { id name stages { id name color order } }
      }
      audiencePreview { recipientCount segmentType segmentId tagIds excludedTagIds }
    }
  }
`;

const editable = (campaign: EmailCampaign | null): boolean =>
  campaign?.status === 'draft' || campaign?.status === 'scheduled';

const legacyBootstrap = async (
  organizationId: number,
  campaignId: number | null,
  signal?: AbortSignal,
): Promise<CampaignEditorBootstrapData> => {
  const [campaign, templateResponse, segments, filterOptions] = await Promise.all([
    campaignId == null
      ? Promise.resolve(null)
      : getCampaignViaGraphql(campaignId, organizationId, signal),
    getEmailTemplatesViaGraphql({}, organizationId, signal),
    getSegmentsViaGraphql({}, organizationId, signal),
    getSegmentFilterOptionsViaGraphql(organizationId, signal),
  ]);
  const audiencePreview = campaignId != null && editable(campaign)
    ? await previewCampaignViaGraphql(campaignId, organizationId, signal)
    : null;
  return {
    campaign,
    templates: templateResponse.templates,
    segments,
    filterOptions,
    audiencePreview,
  };
};

const missingBootstrapField = (error: unknown): boolean =>
  error instanceof Error
  && error.message.includes('Cannot query field')
  && error.message.includes('campaignEditorBootstrap');

export const getCampaignEditorBootstrapViaGraphql = async (
  organizationId: number,
  campaignId: number | null,
  signal?: AbortSignal,
): Promise<CampaignEditorBootstrapData> => {
  if (capability === 'legacy') {
    return legacyBootstrap(organizationId, campaignId, signal);
  }
  try {
    const data = await graphqlRequest<{
      campaignEditorBootstrap: {
        campaign: GraphqlCampaign | null;
        templates: GraphqlEmailTemplate[];
        segments: GraphqlSegment[];
        filterOptions: GraphqlSegmentFilterOptions;
        audiencePreview: CampaignPreview | null;
      };
    }, { campaignId: number | null }>(
      campaignEditorBootstrapQuery,
      { campaignId },
      organizationId,
      signal,
    );
    capability = 'aggregate';
    const bootstrap = data.campaignEditorBootstrap;
    return {
      campaign: bootstrap.campaign ? mapCampaign(bootstrap.campaign) : null,
      templates: bootstrap.templates.map(mapEmailTemplate),
      segments: bootstrap.segments.map(mapSegment),
      filterOptions: mapSegmentFilterOptions(bootstrap.filterOptions),
      audiencePreview: bootstrap.audiencePreview,
    };
  } catch (error) {
    if (capability === 'unknown' && missingBootstrapField(error)) {
      capability = 'legacy';
      return legacyBootstrap(organizationId, campaignId, signal);
    }
    throw error;
  }
};

export const resetCampaignEditorCapability = (): void => {
  capability = 'unknown';
};
