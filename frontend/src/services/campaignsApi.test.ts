import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
    createCampaign,
    getCampaignRecipients,
    getCampaigns,
    previewCampaign,
    sendTestEmail,
} from './campaignsApi';

vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

describe('campaigns API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('VITE_CAMPAIGN_AUDIENCE_PREVIEW_GRAPHQL', 'false');
        vi.stubEnv('VITE_CAMPAIGN_RECIPIENT_READS_GRAPHQL', 'false');
        vi.stubEnv('VITE_CAMPAIGN_TEST_SEND_GRAPHQL', 'false');
        vi.stubEnv('VITE_CAMPAIGN_SEND_GRAPHQL', 'false');
        vi.stubEnv('VITE_CAMPAIGN_PAUSE_RESUME_GRAPHQL', 'false');
    });

    it('maps the shared REST pagination envelope to the campaign consumer contract', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                success: true,
                data: [{ id: 42, name: 'Launch', status: 'draft' }],
                pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
            },
        });

        const result = await getCampaigns({ page: 2, limit: 25 }, 7);

        expect(result.campaigns).toEqual([
            expect.objectContaining({ id: 42, name: 'Launch' }),
        ]);
        expect(result.pagination).toEqual({ page: 2, limit: 25, total: 26, totalPages: 2 });
        expect(api.get).toHaveBeenCalledWith('/api/campaigns', {
            params: { page: 2, limit: 25 },
            headers: { 'x-organization-id': '7' },
        });
    });

    it('persists a saved segment identifier when creating a campaign', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { success: true, data: { id: 43, segment_type: 'segment', segment_id: 91 } },
        });

        const result = await createCampaign({ segment_type: 'segment', segment_id: 91 }, 7);

        expect(result.segment_id).toBe(91);
        expect(api.post).toHaveBeenCalledWith(
            '/api/campaigns',
            { segment_type: 'segment', segment_id: 91 },
            { headers: { 'x-organization-id': '7' } }
        );
    });

    it('exposes the saved segment used by campaign audience preview', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { success: true, data: { recipientCount: 3, segmentType: 'segment', segmentId: 91 } },
        });

        await expect(previewCampaign(43, 7)).resolves.toMatchObject({
            recipientCount: 3,
            segmentType: 'segment',
            segmentId: 91,
        });
    });

    it('keeps campaign recipient inspection on REST by default', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { success: true, data: {
                recipients: [{ id: 17, status: 'opened' }],
                pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
            } },
        });

        await expect(getCampaignRecipients(43, { status: 'opened', page: 2, limit: 25 }, 7))
            .resolves.toMatchObject({ recipients: [{ id: 17, status: 'opened' }] });
        expect(api.get).toHaveBeenCalledWith('/api/campaigns/43/recipients', {
            params: { status: 'opened', page: 2, limit: 25 },
            headers: { 'x-organization-id': '7' },
        });
    });

    it('keeps campaign test delivery on REST by default', async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { success: true, data: {
                success: true, message: 'Test email sent', emailId: 'legacy-1',
            } },
        });
        await expect(sendTestEmail(43, 'recipient@test.itemize', 7)).resolves.toMatchObject({
            success: true, emailId: 'legacy-1',
        });
        expect(api.post).toHaveBeenCalledWith('/api/campaigns/43/send-test', {
            test_email: 'recipient@test.itemize',
        }, { headers: { 'x-organization-id': '7' } });
    });
});
