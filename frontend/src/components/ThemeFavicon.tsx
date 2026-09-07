import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useThemeColor } from '@/hooks/useThemeColor';
import { THEME_PALETTE, type ThemeColor } from '@/lib/themeColor';

const SOURCE_ICON = '/icon.png';
const LIGHT_FAVICON = '/icon.png';
const DARK_FAVICON = '/icon-blue-400.png';

const tinted = new Map<string, string>();

/**
 * Recolour the product mark: every opaque pixel takes the theme's ink, alpha
 * is kept. The mark is a single-colour stroke, so this is exact.
 */
async function tintIcon(color: string): Promise<string> {
  const cached = tinted.get(color);
  if (cached) return cached;
  const image = new Image();
  image.decoding = 'async';
  image.src = SOURCE_ICON;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/png');
  tinted.set(color, url);
  return url;
}

const faviconInk = (color: ThemeColor, dark: boolean): string =>
  THEME_PALETTE[color][dark ? 400 : 600];

function faviconLink(): HTMLLinkElement {
  let favicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    document.head.appendChild(favicon);
  }
  return favicon;
}

export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  const themeColor = useThemeColor();

  useEffect(() => {
    if (!resolvedTheme) return;
    const dark = resolvedTheme === 'dark';
    const favicon = faviconLink();
    // Blue keeps the shipped PNGs; other hues are tinted from the same mark.
    if (themeColor === 'blue') {
      favicon.href = dark ? DARK_FAVICON : LIGHT_FAVICON;
      return;
    }
    let cancelled = false;
    tintIcon(faviconInk(themeColor, dark))
      .then(url => { if (!cancelled) favicon.href = url; })
      .catch(() => { if (!cancelled) favicon.href = dark ? DARK_FAVICON : LIGHT_FAVICON; });
    return () => { cancelled = true; };
  }, [resolvedTheme, themeColor]);

  return null;
}
