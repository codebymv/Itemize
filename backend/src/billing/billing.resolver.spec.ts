import { RequestContextService } from '../request-context/request-context.service';
import { BillingResolver } from './billing.resolver';
import { BillingService } from './billing.service';

describe('BillingResolver', () => {
  const billing = {
    startSoloTrial: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts the Solo trial for the verified organization owner', async () => {
    const expected = { plan: 'starter', subscriptionStatus: 'trialing' };
    billing.startSoloTrial.mockResolvedValue(expected);
    const requestContext = {
      current: () => ({
        organization: { organizationId: 42, organizationRole: 'OWNER' },
      }),
    };
    const resolver = new BillingResolver(
      billing as unknown as BillingService,
      requestContext as unknown as RequestContextService,
    );

    await expect(resolver.startBillingSoloTrial()).resolves.toBe(expected);
    expect(billing.startSoloTrial).toHaveBeenCalledWith(42);
  });

  it('rejects billing changes from non-owner organization members', () => {
    const requestContext = {
      current: () => ({
        organization: { organizationId: 42, organizationRole: 'member' },
      }),
    };
    const resolver = new BillingResolver(
      billing as unknown as BillingService,
      requestContext as unknown as RequestContextService,
    );

    expect(() => resolver.startBillingSoloTrial()).toThrow(
      'Only the organization owner can manage billing',
    );
    expect(billing.startSoloTrial).not.toHaveBeenCalled();
  });
});
