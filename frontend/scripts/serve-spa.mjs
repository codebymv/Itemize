#!/usr/bin/env node
/**
 * Static SPA server: hashed /assets/* 404 if missing instead of returning index.html.
 * `npx serve -s` was serving HTML for stale Vite chunks (MIME text/html).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PORT) || 3000;
const HTML_CACHE = 'no-cache, no-store, must-revalidate';
const ASSET_CACHE = 'public, max-age=31536000, immutable';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const filePath = path.normalize(path.join(dist, decoded));
  const relative = path.relative(dist, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

async function sendFile(res, filePath, cacheControl) {
  const type = MIME[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cacheControl,
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const urlPath = req.url || '/';
  const pathname = urlPath === '/' ? '/index.html' : urlPath.split('?')[0];
  const filePath = resolveSafe(pathname);

  if (!filePath) {
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      const cacheControl = pathname.startsWith('/assets/') ? ASSET_CACHE : HTML_CACHE;
      await sendFile(res, filePath, cacheControl);
      return;
    }
  } catch {
    // missing file
  }

  if (pathname.startsWith('/assets/')) {
    send(res, 404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    }, 'Not found');
    return;
  }

  await sendFile(res, path.join(dist, 'index.html'), HTML_CACHE);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`SPA server listening on ${port}`);
});
