import { useCallback, useSyncExternalStore } from 'react';
import {
  THEME_COLOR_ATTRIBUTE,
  readAppliedThemeColor,
  type ThemeColor,
} from '@/lib/themeColor';

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_COLOR_ATTRIBUTE] });
  return () => observer.disconnect();
};

const snapshot = (): ThemeColor => readAppliedThemeColor();
const serverSnapshot = (): ThemeColor => 'blue';

/**
 * The theme colour currently stamped on the document. Reads the attribute
 * itself rather than React state, so anything that sets it (the boot script,
 * the auth context, a console experiment) is reflected the same way.
 */
export function useThemeColor(): ThemeColor {
  const getSnapshot = useCallback(snapshot, []);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
