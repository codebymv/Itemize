/** Preserve internal destinations without accepting external URLs or auth loops. */
export function safeLoginReturn(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\') || [...decoded].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return fallback;
    const url = new URL(value, 'https://internal.invalid');
    if (url.origin !== 'https://internal.invalid' || /^\/(login|register)(\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function loginReturnUrl(destination: string, expired = false): string {
  const params = new URLSearchParams({redirect: safeLoginReturn(destination)});
  if (expired) params.set('session', 'expired');
  return `/login?${params}`;
}
