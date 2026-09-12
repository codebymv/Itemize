import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AVATAR_CATALOG, avatarAssetPath, pickStarterAvatar } from './avatar-catalog';

describe('avatar catalog', () => {
  it('ships unique, local, static artwork for every selectable key', () => {
    expect(new Set(AVATAR_CATALOG.map(a => a.key)).size).toBe(AVATAR_CATALOG.length);
    for (const avatar of AVATAR_CATALOG) {
      const source = readFileSync(resolve(__dirname, '../../../frontend/public' + avatarAssetPath(avatar.key)), 'utf8');
      expect(source).toContain('viewBox="0 0 64 64"');
      expect(source).not.toMatch(/<script|<animate|<foreignObject|href=/i);
      expect(Buffer.byteLength(source)).toBeLessThan(3000);
    }
    expect(AVATAR_CATALOG.map(a => a.key)).toContain(pickStarterAvatar());
    expect(avatarAssetPath(null)).toBe('');
    expect(avatarAssetPath('../escape')).toBe('');
  });
});
