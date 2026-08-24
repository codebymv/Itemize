import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'itemize:isPublic';
export const ORGANIZATION_SCOPED_KEY = 'itemize:organizationScoped';
export const CSRF_PROTECTED_KEY = 'itemize:csrfProtected';
export const REQUIRED_PLAN_KEY = 'itemize:requiredPlan';

export type RequiredPlan = 'starter' | 'unlimited' | 'pro';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const OrganizationScoped = () =>
  SetMetadata(ORGANIZATION_SCOPED_KEY, true);
export const CsrfProtected = () => SetMetadata(CSRF_PROTECTED_KEY, true);
export const RequiresPlan = (plan: RequiredPlan = 'starter') =>
  SetMetadata(REQUIRED_PLAN_KEY, plan);
