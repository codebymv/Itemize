// Run against the dedicated pilot Vite fixture, never a customer deployment.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.PILOT_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PILOT_PLAYWRIGHT_MODULE).href : 'playwright-core');
const base = 'http://127.0.0.1:5197';
const output = process.env.PILOT_OUTPUT;
if (!output) throw new Error('Set PILOT_OUTPUT to a disposable artifact directory');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.PILOT_CHROMIUM ? {executablePath: process.env.PILOT_CHROMIUM} : {})});
try {
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({viewport: {width, height}, isMobile: name === 'mobile', hasTouch: name === 'mobile'});
    const page = await context.newPage();
    let queries = 0, transitions = 0, dropped = false;
    const receipts = new Map();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let task = {id: 42, contactId: null, title: `Return callback ${'Reference'.repeat(12)}`, description: 'Synthetic caller requests a callback. No real call will be placed.',
      priority: 'medium', status: 'pending', assignedToId: 7, assignedToName: 'Pilot owner', dueAt: null, completedAt: null,
      updatedAt: new Date().toISOString(), version: 1, canEdit: true, canClaim: false};
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname !== '/pilot-graphql') return route.continue();
      const {query, variables} = route.request().postDataJSON();
      const reply = data => route.fulfill({json: {data}});
      if (query.includes('query CsrfToken')) return reply({csrfToken: {token: 'synthetic-csrf'}});
      if (query.includes('mutation RefreshSession')) return route.fulfill({status: 401, json: {errors: [{message: 'Synthetic expired session'}]}});
      assert.equal(route.request().headers()['x-organization-id'], '21');
      if (query.includes('query ClientTasks')) {
        queries++; assert.equal(variables.filter.taskId, 42);
        return reply({clientTasks: {nodes: [task], pageInfo: {page: 1, total: 1, hasNextPage: false, hasPreviousPage: false}, canCreate: true, canManage: true, viewerId: 7, assignees: [{id: 7, name: 'Pilot owner'}]}});
      }
      assert.ok(query.includes('mutation TransitionClientTask'));
      assert.equal(route.request().headers()['x-csrf-token'], 'synthetic-csrf');
      assert.equal(variables.id, 42);
      if (receipts.has(variables.idempotencyKey)) return reply({transitionClientTask: receipts.get(variables.idempotencyKey)});
      assert.equal(variables.expectedVersion, task.version);
      transitions++;
      task = {...task, status: variables.status, version: task.version + 1};
      receipts.set(variables.idempotencyKey, {...task});
      if (!dropped) {dropped = true; return route.abort('failed');}
      return reply({transitionClientTask: task});
    });
    const destination = '/contacts?view=follow-ups&taskId=42&organizationId=21#client-tasks';
    await page.goto(base + destination);
    await page.getByLabel('Email', {exact: true}).fill('pilot@example.invalid');
    assert.equal(new URL(page.url()).searchParams.get('redirect'), destination);
    await page.reload(); // Return destination survives a reload of the login page.
    await page.getByLabel('Email', {exact: true}).fill('pilot@example.invalid');
    await page.getByLabel('Password', {exact: true}).fill('synthetic-password');
    await page.locator('button[type="submit"]').click();
    await page.getByRole('alert').filter({hasText: 'different organization'}).waitFor();
    assert.equal(queries, 0);
    assert.equal(new URL(page.url()).search + new URL(page.url()).hash, destination.slice('/contacts'.length));
    await page.getByLabel('Organization', {exact: true}).selectOption('21');
    await page.getByRole('button', {name: 'Complete', exact: true}).waitFor();
    const screenshot = await page.screenshot({path: `${output}/${name}-task.png`, fullPage: true});
    assert.equal(screenshot.readUInt32BE(16), width, `${name}: screenshot exceeds viewport width`);
    assert.ok(await page.getByRole('heading', {name: /^Return callback/}).evaluate(element => element.scrollWidth <= element.clientWidth), `${name}: title is clipped`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: task overflows viewport`);
    await page.getByRole('button', {name: 'Complete', exact: true}).click();
    await page.getByRole('button', {name: 'Retry save', exact: true}).click();
    await page.getByRole('button', {name: 'Reopen', exact: true}).waitFor();
    assert.equal(transitions, 1);
    await page.screenshot({path: `${output}/${name}-completed.png`, fullPage: true});
    await page.getByRole('button', {name: 'Reopen', exact: true}).click();
    await page.getByRole('button', {name: 'Complete', exact: true}).waitFor();
    assert.equal(transitions, 2);
    await page.getByRole('button', {name: 'Expire synthetic session'}).click();
    await page.getByLabel('Email', {exact: true}).waitFor();
    const expiredLogin = new URL(page.url());
    assert.equal(expiredLogin.searchParams.get('redirect'), destination);
    assert.equal(expiredLogin.searchParams.get('session'), 'expired');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({scenario: name, queries, transitions, duplicateEffects: 0, passed: true}));
    await context.close();
  }
} finally {await browser.close();}
