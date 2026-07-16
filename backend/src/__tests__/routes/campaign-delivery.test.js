const emailService = require('../../services/emailService');
const { sendCampaignEmails } = require('../../routes/campaigns/delivery');

jest.mock('../../services/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue({ id: 'email-1' }),
}));

describe('campaign delivery completion contract', () => {
    test('does not overwrite a concurrently paused campaign as sent', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await sendCampaignEmails(
            pool,
            9,
            { subject: 'Hello', content_html: '<p>Hello</p>' },
            [{ contact_id: 4, email: 'person@example.com', first_name: 'Person' }]
        );

        expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
        const finalUpdate = client.query.mock.calls.find(([sql]) =>
            /SET\s+status = 'sent'/.test(sql)
        );
        expect(finalUpdate[0]).toContain("WHERE id = $1 AND status = 'sending'");
        expect(finalUpdate[0]).toContain("SELECT COUNT(*) FROM campaign_recipients");
        expect(finalUpdate[1]).toEqual([9]);
    });
});
