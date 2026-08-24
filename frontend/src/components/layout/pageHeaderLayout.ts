export const PAGE_TITLE_CLASS =
  'text-xl font-semibold italic truncate italic-safe font-raleway text-foreground';

interface MobileIconFitInput {
  availableWidth: number;
  titleWidth: number;
  iconWidth: number;
  leadingWidth?: number;
  gap: number;
}

export const shouldShowMobilePageHeaderIcon = ({
  availableWidth,
  titleWidth,
  iconWidth,
  leadingWidth = 0,
  gap,
}: MobileIconFitInput): boolean => {
  if (availableWidth <= 0 || titleWidth <= 0 || iconWidth <= 0) return true;
  const visibleParts = 2 + (leadingWidth > 0 ? 1 : 0);
  const requiredWidth = titleWidth + iconWidth + leadingWidth + gap * (visibleParts - 1);
  return requiredWidth <= availableWidth + 1;
};
