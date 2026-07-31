import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignRecipients,
  getCampaigns,
  pauseCampaign,
  previewCampaign,
  resumeCampaign,
  scheduleCampaign,
  sendCampaign,
  sendTestEmail,
  unscheduleCampaign,
  updateCampaign,
} from './campaignsApi';
import * as graphql from './campaignsGraphql';

vi.mock('./campaignsGraphql', () => ({
  createCampaignViaGraphql: vi.fn(),
  deleteCampaignViaGraphql: vi.fn(),
  duplicateCampaignViaGraphql: vi.fn(),
  getCampaignViaGraphql: vi.fn(),
  getCampaignsViaGraphql: vi.fn(),
  getCampaignRecipientsViaGraphql: vi.fn(),
  pauseCampaignViaGraphql: vi.fn(),
  previewCampaignViaGraphql: vi.fn(),
  resumeCampaignViaGraphql: vi.fn(),
  scheduleCampaignViaGraphql: vi.fn(),
  sendCampaignTestViaGraphql: vi.fn(),
  sendCampaignViaGraphql: vi.fn(),
  unscheduleCampaignViaGraphql: vi.fn(),
  updateCampaignViaGraphql: vi.fn(),
}));

describe('campaign API GraphQL dispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes every campaign read and mutation through GraphQL', async () => {
    const draft = { name: 'Launch', segment_type: 'all' as const };
    const update = { subject: 'Updated' };

    await getCampaigns({ page: 2, limit: 25, search: 'launch' }, 7);
    await getCampaign(43, 7);
    await createCampaign(draft, 7);
    await updateCampaign(43, update, 7);
    await deleteCampaign(43, 7);
    await duplicateCampaign(43, 7);
    await scheduleCampaign(43, '2026-08-01T12:00:00Z', 'America/Phoenix', 7);
    await unscheduleCampaign(43, 7);
    await getCampaignRecipients(43, { status: 'opened', page: 2, limit: 25 }, 7);
    await previewCampaign(43, 7);

    expect(graphql.getCampaignsViaGraphql).toHaveBeenCalledWith(
      { page: 2, limit: 25, search: 'launch' }, 7,
    );
    expect(graphql.getCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.createCampaignViaGraphql).toHaveBeenCalledWith(draft, 7);
    expect(graphql.updateCampaignViaGraphql).toHaveBeenCalledWith(43, update, 7);
    expect(graphql.deleteCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.duplicateCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.scheduleCampaignViaGraphql).toHaveBeenCalledWith(
      43, '2026-08-01T12:00:00Z', 'America/Phoenix', 7,
    );
    expect(graphql.unscheduleCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.getCampaignRecipientsViaGraphql).toHaveBeenCalledWith(
      43, { status: 'opened', page: 2, limit: 25 }, 7,
    );
    expect(graphql.previewCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
  });

  it('routes campaign delivery controls through GraphQL', async () => {
    await sendCampaign(43, 7);
    await pauseCampaign(43, 7);
    await resumeCampaign(43, 7);
    await sendTestEmail(43, 'recipient@test.itemize', 7);

    expect(graphql.sendCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.pauseCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.resumeCampaignViaGraphql).toHaveBeenCalledWith(43, 7);
    expect(graphql.sendCampaignTestViaGraphql).toHaveBeenCalledWith(
      43, 'recipient@test.itemize', 7,
    );
  });
});
