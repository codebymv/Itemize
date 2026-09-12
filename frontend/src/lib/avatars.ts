/** Paths are always local; the backend catalog owns which keys can be saved. */
export const avatarImageUrl = (key: string | null | undefined): string | undefined =>
  key && /^[a-z][a-z0-9-]{0,63}$/.test(key) ? `/assets/avatars/${key}.svg` : undefined;

export const userInitials = (name?: string | null, email?: string | null): string => {
  const value = name?.trim().normalize('NFC') || email?.split('@')[0]?.trim() || '';
  const parts = value.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1
    ? [Array.from(parts[0])[0], Array.from(parts[parts.length - 1])[0]]
    : Array.from(parts[0] || '').slice(0, 2);
  return letters.join('').toLocaleUpperCase() || '?';
};
