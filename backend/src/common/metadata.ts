import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'itemize:isPublic';
export const ACCOUNT_SCOPED_KEY = 'itemize:accountScoped';
export const ORGANIZATION_SCOPED_KEY = 'itemize:organizationScoped';
export const PLATFORM_ADMIN_SCOPED_KEY = 'itemize:platformAdminScoped';
export const HTTP_PUBLIC_RESOURCE_SCOPED_KEY = 'itemize:httpPublicResourceScoped';
export const HTTP_CAPABILITY_SCOPED_KEY = 'itemize:httpCapabilityScoped';
export const HTTP_PROVIDER_WEBHOOK_SCOPED_KEY = 'itemize:httpProviderWebhookScoped';
export const HTTP_SESSION_SCOPED_KEY = 'itemize:httpSessionScoped';
export const CSRF_PROTECTED_KEY = 'itemize:csrfProtected';
export const REQUIRED_PLAN_KEY = 'itemize:requiredPlan';

export type RequiredPlan = 'starter' | 'unlimited' | 'pro';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const AccountScoped = () => SetMetadata(ACCOUNT_SCOPED_KEY, true);
export const OrganizationScoped = () =>
  SetMetadata(ORGANIZATION_SCOPED_KEY, true);
export const PlatformAdminScoped = () =>
  SetMetadata(PLATFORM_ADMIN_SCOPED_KEY, true);
export const HttpPublicResourceScoped = () =>
  SetMetadata(HTTP_PUBLIC_RESOURCE_SCOPED_KEY, true);
export const HttpCapabilityScoped = () =>
  SetMetadata(HTTP_CAPABILITY_SCOPED_KEY, true);
export const HttpProviderWebhookScoped = () =>
  SetMetadata(HTTP_PROVIDER_WEBHOOK_SCOPED_KEY, true);
export const HttpSessionScoped = () =>
  SetMetadata(HTTP_SESSION_SCOPED_KEY, true);
export const CsrfProtected = () => SetMetadata(CSRF_PROTECTED_KEY, true);
export const RequiresPlan = (plan: RequiredPlan = 'starter') =>
  SetMetadata(REQUIRED_PLAN_KEY, plan);
