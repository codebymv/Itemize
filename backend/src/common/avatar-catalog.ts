import { randomInt } from 'node:crypto';

/** Authored catalog; clients fetch it through GraphQL instead of mirroring it. */
export const AVATAR_CATALOG = [
  { key: 'cumulus', name: 'Cumulus' },
  { key: 'dawn', name: 'Dawn' },
  { key: 'moonrise', name: 'Moonrise' },
  { key: 'rainfall', name: 'Rainfall' },
  { key: 'aurora', name: 'Aurora' },
  { key: 'rainbow', name: 'Rainbow' },
] as const;

export const isAvatarKey = (key: unknown): key is string =>
  typeof key === 'string' && AVATAR_CATALOG.some(avatar => avatar.key === key);

export const avatarAssetPath = (key: unknown): string =>
  isAvatarKey(key) ? `/assets/avatars/${key}.svg` : '';

/** Called only when creating an account; the selected key is persisted. */
export const pickStarterAvatar = (): string =>
  AVATAR_CATALOG[randomInt(AVATAR_CATALOG.length)].key;
