import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'itemize:isPublic';
export const ORGANIZATION_SCOPED_KEY = 'itemize:organizationScoped';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const OrganizationScoped = () =>
  SetMetadata(ORGANIZATION_SCOPED_KEY, true);
