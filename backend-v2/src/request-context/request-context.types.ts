export type AuthenticatedIdentity = {
  userId: number;
};

export type OrganizationIdentity = {
  organizationId: number;
  organizationRole: string;
};

export type ItemizeRequestContext = {
  requestId: string;
  identity?: AuthenticatedIdentity;
  organization?: OrganizationIdentity;
};
