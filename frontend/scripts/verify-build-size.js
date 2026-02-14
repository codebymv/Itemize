#!/usr/bin/env node

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Size limits (in bytes)
const LIMITS = {
  index_js: 300 * 1024,       // 300KB (actual main bundle is ~303KB)
  react_vendor: 180 * 1024,    // 180KB (actual is 161KB)
  ui_vendor: 120 * 1024,       // 120KB (actual is 104KB)
  query_vendor: 50 * 1024,     // 50KB (actual is 41KB)
  utils_vendor: 30 * 1024,     // 30KB
};

function getFileSize(filePath) {
  try {
    const stats = readFileSync(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return 0;
  }
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function checkFileSize(filePath, limit, name) {
  const size = getFileSize(filePath);

  if (size > limit) {
    console.error(`❌ ${name}: ${filePath.replace(/^.*[\\/]/, '')} - ${formatSize(size)} (limit: ${formatSize(limit)})`);
    return false;
  }

  console.log(`✅ ${name}: ${filePath.replace(/^.*[\\/]/, '')} - ${formatSize(size)}`);
  return true;
}

function main() {
  console.log('📊 Checking bundle sizes...\n');

  let allPassed = true;

  // Check dist directory
  const distDir = join(__dirname, '../dist');

  try {
    const files = readdirSync(distDir);

    if (!files.includes('assets')) {
      console.error('❌ dist/assets directory not found. Run "npm run build" first.');
      process.exit(1);
    }

    const assetsDir = join(__dirname, '../dist/assets');
    const assetsFiles = readdirSync(assetsDir);

    // Check index.js
    const indexJss = assetsFiles.filter(f => f === 'index.js');
    if (indexJss.length === 0) {
      // Check for hashed index.js files (e.g., index-abc123.js)
      const hashedIndexJss = assetsFiles.filter(f => /^index-[a-f0-9]+\.js$/.test(f));
      if (hashedIndexJss.length > 0) {
        hashedIndexJss.sort((a, b) => a.localeCompare(b)).reverse();
        const latestIndexJs = hashedIndexJss[0];
        const indexPath = join(assetsDir, latestIndexJs);
        if (!checkFileSize(indexPath, LIMITS.index_js, 'index.js')) {
          allPassed = false;
        }
      } else {
        console.warn('⚠️  No index.js found (build may have failed)');
      }
    } else {
      const indexPath = join(assetsDir, 'index.js');
      if (!checkFileSize(indexPath, LIMITS.index_js, 'index.js')) {
        allPassed = false;
      }
    }

    // Check vendor chunks
    const vendorFiles = assetsFiles.filter(f => /vendor(-[a-z]+)?-[a-f0-9]+\.js$/.test(f));

    vendorFiles.forEach(f => {
      const filePath = join(assetsDir, f);
      const size = getFileSize(filePath);
      let limit;
      if (f.includes('react-vendor')) {
        limit = 'react_vendor';
      } else if (f.includes('ui-vendor')) {
        limit = 'ui_vendor';
      } else if (f.includes('query-vendor')) {
        limit = 'query_vendor';
      } else if (f.includes('router-vendor')) {
        limit = 'router_vendor';
      } else if (f.includes('utils-vendor')) {
        limit = 'utils_vendor';
      } else {
        limit = 'other';
      }

      if (limit !== 'other' && LIMITS[limit] && size > LIMITS[limit]) {
        console.error(`❌ ${f.replace(/^.*[\\/]/, '')}: ${formatSize(size)} (limit: ${formatSize(LIMITS[limit])})`);
        allPassed = false;
      }
    });

    console.log('\n' + (allPassed ? '✅ All bundle sizes OK!' : '❌ Bundle sizes too large!'));

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('Error checking bundle sizes:', error);
    process.exit(1);
  }
}

main();