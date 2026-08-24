import { authenticatedHomePath } from './entitlements';
import { storage } from './storage';

export type StartPagePreference = 'automatic' | 'canvas' | 'dashboard';

const START_PAGE_KEY = 'itemize-start-page';
const REDUCE_MOTION_KEY = 'itemize-reduce-motion';

const isStartPagePreference = (value: string | null): value is StartPagePreference =>
  value === 'automatic' || value === 'canvas' || value === 'dashboard';

export const getStartPagePreference = (): StartPagePreference => {
  const value = storage.getItem(START_PAGE_KEY);
  return isStartPagePreference(value) ? value : 'automatic';
};

export const setStartPagePreference = (value: StartPagePreference): void => {
  storage.setItem(START_PAGE_KEY, value);
};

export const preferredHomePath = (isSubscribed: boolean): '/dashboard' | '/canvas' => {
  const preference = getStartPagePreference();

  if (preference === 'canvas') return '/canvas';
  if (preference === 'dashboard' && isSubscribed) return '/dashboard';

  return authenticatedHomePath(isSubscribed);
};

export const getReduceMotionPreference = (): boolean =>
  storage.getItem(REDUCE_MOTION_KEY) === 'true';

export const applyReduceMotionPreference = (enabled: boolean): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', enabled);
};

export const setReduceMotionPreference = (enabled: boolean): void => {
  storage.setItem(REDUCE_MOTION_KEY, String(enabled));
  applyReduceMotionPreference(enabled);
};

export const initializeUserPreferences = (): void => {
  applyReduceMotionPreference(getReduceMotionPreference());
};
