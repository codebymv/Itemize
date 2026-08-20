export type AuthenticatedIdentity = {
  userId: number;
};

export type OrganizationIdentity = {
  organizationId: number;
  organizationRole: string;
};

export type OrganizationEntitlementIdentity = {
  organizationId: number;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | string | null;
};

export type ItemizeRequestContext = {
  requestId: string;
  identity?: AuthenticatedIdentity;
  organization?: OrganizationIdentity;
  entitlement?: OrganizationEntitlementIdentity;
};
