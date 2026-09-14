export type AuthenticatedIdentity = {
  userId: number;
  sessionId?: string;
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
