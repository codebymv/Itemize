const StripeSubscriptionService = require('../../services/stripeSubscriptionService');
const emailService = require('../../services/emailService');

jest.mock('../../services/emailService', () => ({
    sendTemplateEmail: jest.fn()
}));

describe('StripeSubscriptionService', () => {
    let service;
    let poolMock;

    beforeEach(() => {
        poolMock = {
            query: jest.fn()
        };
        service = new StripeSubscriptionService(poolMock);
        // Mock logging to avoid noise
        service.logInfo = jest.fn();
        service.logError = jest.fn();
        service.logWarn = jest.fn();
        service.logSubscriptionEvent = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('handleTrialEnding', () => {
        it('should log subscription event and send trial ending email', async () => {
            const organizationId = 123;
            const subscriptionId = 'sub_123';
            const trialEnd = Math.floor(Date.now() / 1000) + 86400 * 3; // 3 days from now

            const subscription = {
                id: subscriptionId,
                trial_end: trialEnd,
                metadata: { organizationId: organizationId.toString() }
            };

            const mockOrg = { email: 'test@example.com', name: 'Test Org' };
            poolMock.query.mockResolvedValueOnce({ rows: [mockOrg] });

            await service.handleTrialEnding(subscription);

            expect(service.logSubscriptionEvent).toHaveBeenCalledWith(
                organizationId,
                subscriptionId,
                'trial_ending',
                { trialEnd }
            );

            expect(poolMock.query).toHaveBeenCalledWith(
                'SELECT email, name FROM organizations WHERE id = $1',
                [organizationId]
            );

            expect(emailService.sendTemplateEmail).toHaveBeenCalledWith({
                template: expect.objectContaining({
                    subject: 'Your trial is ending soon',
                    body_html: expect.stringContaining(mockOrg.name)
                }),
                contact: { email: mockOrg.email, first_name: mockOrg.name }
            });

            expect(service.logInfo).toHaveBeenCalledWith(
                'Sent trial ending email notification',
                { organizationId, email: mockOrg.email }
            );
        });

        it('should warn if organization or email is not found', async () => {
            const organizationId = 123;
            const subscription = {
                id: 'sub_123',
                trial_end: 1234567890,
                metadata: { organizationId: organizationId.toString() }
            };

            poolMock.query.mockResolvedValueOnce({ rows: [] });

            await service.handleTrialEnding(subscription);

            expect(emailService.sendTemplateEmail).not.toHaveBeenCalled();
            expect(service.logWarn).toHaveBeenCalledWith(
                'Could not send trial ending email - organization or email not found',
                { organizationId }
            );
        });
    });
});
