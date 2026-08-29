import {
  STAT_BADGE_CLASSES,
  STAT_ICON_BG_CLASSES,
  STAT_ICON_CLASSES,
} from '@/hooks/useStatStyles';
import { CONTENT_STATUS_VISUALS } from './contentVisuals';

describe('content status visuals', () => {
  it('uses the same archived red tokens as summary cards', () => {
    expect(CONTENT_STATUS_VISUALS.archived.badgeClass).toContain(STAT_BADGE_CLASSES.red);
    expect(CONTENT_STATUS_VISUALS.archived.iconBackgroundClass).toBe(STAT_ICON_BG_CLASSES.red);
    expect(CONTENT_STATUS_VISUALS.archived.iconClass).toBe(STAT_ICON_CLASSES.red);
  });
});
