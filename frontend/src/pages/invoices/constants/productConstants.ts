import { PackageCheck, PackageX } from 'lucide-react';
import { defineStatus, type StatusVisual } from '@/lib/statusVisuals';

export const PRODUCT_STATUS_CONFIG: Record<'active' | 'inactive', StatusVisual> = {
  active: defineStatus('Available', 'blue', PackageCheck),
  inactive: defineStatus('Unavailable', 'orange', PackageX),
};

export function getProductStatusVisual(isActive: boolean): StatusVisual {
  return PRODUCT_STATUS_CONFIG[isActive ? 'active' : 'inactive'];
}
