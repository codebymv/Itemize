const RELOAD_KEY = 'vite:preload-reload';
const RELOAD_WINDOW_MS = 10_000;

function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed')
  );
}

function reloadOnce(): void {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
  if (last && now - last < RELOAD_WINDOW_MS) return;
  sessionStorage.setItem(RELOAD_KEY, String(now));
  window.location.reload();
}

/** After a deploy, old hashed chunks 404 as HTML. Reload once onto the new index. */
export function reloadOnStaleChunk(): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce();
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleChunkError(event.reason)) return;
    event.preventDefault();
    reloadOnce();
  });
}
