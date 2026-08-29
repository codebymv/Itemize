#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist');
const assets = join(dist, 'assets');
const limits = {
  entry: 430 * 1024,
  'react-vendor': 190 * 1024,
  'router-vendor': 42 * 1024,
  // Pipeline stacking adds the multi-query observer; the expanded sales surfaces
  // also deliberately use a broader set of semantic Lucide status/action icons.
  'query-vendor': 46 * 1024,
  icons: 48 * 1024,
  'axios-vendor': 50 * 1024,
};

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

const check = (file, limit, label) => {
  const size = statSync(join(assets, file)).size;
  if (size > limit) {
    console.error(`FAIL ${label}: ${file} is ${kb(size)} (budget ${kb(limit)})`);
    return false;
  }
  console.log(`PASS ${label}: ${file} is ${kb(size)} (budget ${kb(limit)})`);
  return true;
};

try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entryMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']\/assets\/([^"']+\.js)["']/i);
  if (!entryMatch) throw new Error('Could not find the module entry in dist/index.html');

  let passed = check(entryMatch[1], limits.entry, 'entry');
  const files = readdirSync(assets);
  for (const [prefix, limit] of Object.entries(limits)) {
    if (prefix === 'entry') continue;
    const file = files.find((candidate) => candidate.startsWith(`${prefix}-`) && candidate.endsWith('.js'));
    if (!file) throw new Error(`Expected ${prefix} chunk was not emitted`);
    passed = check(file, limit, prefix) && passed;
  }

  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(`FAIL bundle-size gate: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
