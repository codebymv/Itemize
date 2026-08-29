import { useEffect } from 'react';
import { useTheme } from 'next-themes';

const LIGHT_FAVICON = '/icon.png';
const DARK_FAVICON = '/icon-blue-400.png';

export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;

    let favicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');

    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      document.head.appendChild(favicon);
    }

    favicon.href = resolvedTheme === 'dark' ? DARK_FAVICON : LIGHT_FAVICON;
  }, [resolvedTheme]);

  return null;
}
