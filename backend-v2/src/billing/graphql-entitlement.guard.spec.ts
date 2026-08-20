import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from '../request-context/request-context.service';
import { BillingEntitlementService } from './billing-entitlement.service';
import { GraphqlEntitlementGuard } from './graphql-entitlement.guard';

describe('GraphqlEntitlementGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const entitlements = { assertPlan: jest.fn() };
  const requestContext = { current: jest.fn() };
  const guard = new GraphqlEntitlementGuard(
    reflector as unknown as Reflector,
    entitlements as unknown as BillingEntitlementService,
    requestContext as unknown as RequestContextService,
  );
  const context = {
    getType: () => 'graphql',
    getHandler: () => function handler() {},
    getClass: () => class Resolver {},
  } as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('skips resolvers without a plan requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlements.assertPlan).not.toHaveBeenCalled();
  });

  it('enforces the declared tier for the verified organization', async () => {
    reflector.getAllAndOverride.mockReturnValue('unlimited');
    requestContext.current.mockReturnValue({
      organization: { organizationId: 42, organizationRole: 'OWNER' },
    });
    entitlements.assertPlan.mockResolvedValue(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlements.assertPlan).toHaveBeenCalledWith(42, 'unlimited');
  });

  it('fails closed when plan metadata is used without organization scope', async () => {
    reflector.getAllAndOverride.mockReturnValue('starter');
    requestContext.current.mockReturnValue({});

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      extensions: { code: 'ORGANIZATION_REQUIRED' },
    });
  });
});
