import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import puppeteer from 'puppeteer';
import { Server as SocketServer } from 'socket.io';

const TOKEN = '123e4567-e89b-42d3-a456-426614174001';
const ROTATED_TOKEN = '123e4567-e89b-42d3-a456-426614174002';
const SERVE_ONLY = process.argv.includes('--serve');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..', '..', 'frontend');
const viteBin = path.resolve(frontendDirectory, '..', 'node_modules', 'vite', 'bin', 'vite.js');

const initialList = (title = 'Browser Baseline') => ({
  id: 'browser-list-1',
  title,
  category: 'Cutover',
  items: [{ id: 'baseline-item', text: 'Baseline item', completed: false }],
  color_value: '#3B82F6',
  created_at: '2026-07-17T00:00:00.000Z',
  updated_at: '2026-07-17T00:00:00.000Z',
  creator_name: 'Cutover Harness',
  type: 'list',
});

async function availablePort(preferred) {
  const server = net.createServer();
  server.unref();
  server.listen(preferred, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(predicate, description, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForHttp(url) {
  await waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, `${url} to respond`);
}

function createFixtureApi(frontendOrigin) {
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: frontendOrigin, credentials: true },
  });
  const state = {
    list: initialList(),
    validTokens: new Set([TOKEN]),
    readCount: 0,
    joinCount: 0,
    nextRead: 'normal',
    heldRead: null,
  };

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    next();
  });

  app.get('/api/shared/list/:token', async (req, res) => {
    state.readCount += 1;
    if (!state.validTokens.has(req.params.token)) {
      res.status(404).json({ error: 'Shared list not found' });
      return;
    }

    if (state.nextRead === 'fail') {
      state.nextRead = 'normal';
      res.status(418).json({ error: 'Deliberate recovery failure' });
      return;
    }

    if (state.nextRead === 'hold') {
      state.nextRead = 'normal';
      await new Promise(resolve => {
        state.heldRead = { release: resolve };
      });
      state.heldRead = null;
    }

    res.json(state.list);
  });

  app.get('/api/auth/me', (_req, res) => res.status(401).json({ error: 'Not authenticated' }));
  app.get('/api/organizations', (_req, res) => res.json([]));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not part of browser fixture' }));

  io.on('connection', socket => {
    socket.on('joinSharedList', token => {
      state.joinCount += 1;
      if (!state.validTokens.has(token)) {
        socket.emit('realtimeError', {
          code: 'INVALID_CAPABILITY',
          message: 'Invalid or inactive share link',
        });
        return;
      }
      socket.join(`shared-list-${token}`);
      socket.emit('joinedSharedList', { listTitle: state.list.title });
      socket.emit('viewerCount', 1);
    });
  });

  return {
    server,
    io,
    state,
    async dropConnections() {
      const sockets = await io.fetchSockets();
      for (const socket of sockets) socket.conn.close();
    },
    emitUpdate(token, type, data) {
      io.to(`shared-list-${token}`).emit('listUpdated', {
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    },
    async close() {
      await new Promise(resolve => io.close(resolve));
      if (server.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    },
  };
}

async function startVite(port, apiUrl) {
  const child = spawn(process.execPath, [
    viteBin,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--strictPort',
  ], {
    cwd: frontendDirectory,
    env: {
      ...process.env,
      VITE_API_URL: apiUrl,
      VITE_GOOGLE_CLIENT_ID: 'browser-harness.apps.googleusercontent.com',
      VITE_MARKETING_CHAT_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  child.exited = new Promise(resolve => child.once('exit', resolve));
  child.getOutput = () => output;
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    child.exited,
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function bodyText(page) {
  return page.$eval('body', element => element.innerText);
}

async function waitForText(page, text) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 12_000 },
    text,
  );
}

async function openSharedPage(browser, frontendUrl, token, expectedTitle) {
  const page = await browser.newPage();
  await page.goto(`${frontendUrl}/shared/list/${token}`, { waitUntil: 'domcontentloaded' });
  await waitForText(page, expectedTitle);
  await page.waitForSelector('[data-realtime-status="live"]', { timeout: 12_000 });
  return page;
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const installedBrowser = candidates.find(candidate => existsSync(candidate));
  if (installedBrowser) return installedBrowser;

  try {
    return puppeteer.executablePath();
  } catch {
    return undefined;
  }
}

async function runBrowserScenarios(fixture, frontendUrl) {
  const executablePath = resolveBrowserExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    console.log('1/4 reconnect reauthorizes, refetches, then applies queued updates');
    fixture.state.list = initialList('Reconnect Baseline');
    const reconnectPage = await openSharedPage(browser, frontendUrl, TOKEN, 'Reconnect Baseline');
    const firstJoinCount = fixture.state.joinCount;
    fixture.state.list = {
      ...initialList('Authoritative State'),
      items: [{ id: 'authoritative-item', text: 'Authoritative item', completed: false }],
    };
    fixture.state.nextRead = 'hold';
    await fixture.dropConnections();
    await waitFor(
      () => fixture.state.joinCount > firstJoinCount && fixture.state.heldRead,
      'the reconnect recovery read to be held',
    );
    fixture.emitUpdate(TOKEN, 'LIST_UPDATE', { title: 'Queued Update' });
    assert.match(await bodyText(reconnectPage), /Reconnect Baseline/);
    assert.doesNotMatch(await bodyText(reconnectPage), /Queued Update/);
    fixture.state.heldRead.release();
    await waitForText(reconnectPage, 'Queued Update');
    await waitForText(reconnectPage, 'Authoritative item');
    await reconnectPage.waitForSelector('[data-realtime-status="live"]');
    await reconnectPage.close();

    console.log('2/4 failed recovery keeps the last-loaded static projection offline');
    fixture.state.list = initialList('Static Fallback');
    const fallbackPage = await openSharedPage(browser, frontendUrl, TOKEN, 'Static Fallback');
    const fallbackJoinCount = fixture.state.joinCount;
    fixture.state.list = initialList('Must Not Replace Static Content');
    fixture.state.nextRead = 'fail';
    await fixture.dropConnections();
    await waitFor(() => fixture.state.joinCount > fallbackJoinCount, 'the failed recovery join');
    await fallbackPage.waitForSelector('[data-realtime-status="offline"]', { timeout: 12_000 });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.match(await bodyText(fallbackPage), /Static Fallback/);
    assert.doesNotMatch(await bodyText(fallbackPage), /Must Not Replace Static Content/);
    await fallbackPage.close();

    console.log('3/4 deletion removes the stale public projection');
    fixture.state.list = initialList('Delete Me');
    const deletionPage = await openSharedPage(browser, frontendUrl, TOKEN, 'Delete Me');
    fixture.emitUpdate(TOKEN, 'listDeleted', {
      id: fixture.state.list.id,
      message: 'This list has been deleted by the owner.',
    });
    await waitForText(deletionPage, 'This list has been deleted by the owner.');
    assert.doesNotMatch(await bodyText(deletionPage), /Delete Me/);
    await deletionPage.close();

    console.log('4/4 capability rotation rejects the old link and admits the new link');
    fixture.state.list = initialList('Before Rotation');
    const oldPage = await openSharedPage(browser, frontendUrl, TOKEN, 'Before Rotation');
    const rotationJoinCount = fixture.state.joinCount;
    fixture.state.validTokens.delete(TOKEN);
    fixture.state.validTokens.add(ROTATED_TOKEN);
    fixture.state.list = initialList('Rotated Capability');
    await fixture.dropConnections();
    await waitFor(() => fixture.state.joinCount > rotationJoinCount, 'the rotated old capability denial');
    await waitForText(oldPage, 'This shared list is no longer available.');
    assert.doesNotMatch(await bodyText(oldPage), /Before Rotation/);
    const newPage = await openSharedPage(browser, frontendUrl, ROTATED_TOKEN, 'Rotated Capability');
    await newPage.close();
    await oldPage.close();
  } finally {
    await browser.close();
  }
}

let vite;
let fixture;
try {
  const frontendPort = await availablePort(SERVE_ONLY ? 4178 : 0);
  const apiPort = await availablePort(SERVE_ONLY ? 3178 : 0);
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  fixture = createFixtureApi(frontendUrl);
  fixture.server.listen(apiPort, '127.0.0.1');
  await once(fixture.server, 'listening');
  vite = await startVite(frontendPort, apiUrl);
  await waitForHttp(frontendUrl);

  if (SERVE_ONLY) {
    console.log(`Shared realtime browser fixture ready: ${frontendUrl}/shared/list/${TOKEN}`);
    await new Promise(resolve => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } else {
    await runBrowserScenarios(fixture, frontendUrl);
    console.log('Shared realtime browser gate passed: 4/4 scenarios.');
  }
} catch (error) {
  if (vite?.getOutput()) console.error(vite.getOutput());
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopChild(vite);
  await fixture?.close();
}
