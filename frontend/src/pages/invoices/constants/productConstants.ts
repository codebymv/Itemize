import { PackageCheck, PackageX } from 'lucide-react';
import { defineStatus, type StatusVisual } from '@/lib/statusVisuals';

export const PRODUCT_STATUS_CONFIG: Record<'active' | 'inactive', StatusVisual> = {
  active: defineStatus('Active', 'blue', PackageCheck),
  inactive: defineStatus('Inactive', 'orange', PackageX),
};

export function getProductStatusVisual(isActive: boolean): StatusVisual {
  return PRODUCT_STATUS_CONFIG[isActive ? 'active' : 'inactive'];
}
