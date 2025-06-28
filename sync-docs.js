#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const DOCS_SOURCE = '!docs';
const DOCS_TARGET = 'backend/docs';

/**
 * Cross-platform copy function
 */
async function copyDocs() {
  console.log('🔄 Syncing documentation...');
  console.log(`📁 Source: ${DOCS_SOURCE}`);
  console.log(`📁 Target: ${DOCS_TARGET}`);

  try {
    // Check if source exists
    await fs.access(DOCS_SOURCE);
    
    // Remove target if it exists
    try {
      await fs.rm(DOCS_TARGET, { recursive: true, force: true });
    } catch (err) {
      // Target doesn't exist, which is fine
    }

    // Create target directory
    await fs.mkdir(DOCS_TARGET, { recursive: true });

    // Copy recursively
    await copyRecursive(DOCS_SOURCE, DOCS_TARGET);
    
    console.log('✅ Documentation synced successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error syncing documentation:', error.message);
    return false;
  }
}

/**
 * Recursive copy function
 */
async function copyRecursive(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Watch for changes in docs directory
 */
function watchDocs() {
  console.log('👀 Watching for changes in documentation...');
  console.log('💡 Press Ctrl+C to stop watching');
  
  try {
    const chokidar = require('chokidar');
    
    const watcher = chokidar.watch(DOCS_SOURCE, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    let syncTimeout;

    watcher
      .on('add', (path) => debounceSync(`📄 Added: ${path}`))
      .on('change', (path) => debounceSync(`📝 Changed: ${path}`))
      .on('unlink', (path) => debounceSync(`🗑️  Deleted: ${path}`))
      .on('addDir', (path) => debounceSync(`📁 Added directory: ${path}`))
      .on('unlinkDir', (path) => debounceSync(`🗑️  Deleted directory: ${path}`))
      .on('error', (error) => console.error('❌ Watcher error:', error))
      .on('ready', () => console.log('✅ Initial scan complete. Ready for changes.'));

    function debounceSync(message) {
      console.log(message);
      
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        copyDocs();
      }, 500); // Wait 500ms for multiple rapid changes
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping documentation watcher...');
      watcher.close();
      process.exit(0);
    });
  } catch (error) {
    console.log('❌ chokidar not found. Please install it:');
    console.log('npm install chokidar --save-dev');
    console.log('💡 Falling back to simple sync for now');
    copyDocs();
  }
}

/**
 * Check if documentation is in sync
 */
async function checkSync() {
  try {
    const sourceExists = await fs.access(DOCS_SOURCE).then(() => true).catch(() => false);
    const targetExists = await fs.access(DOCS_TARGET).then(() => true).catch(() => false);

    if (!sourceExists) {
      console.log('❌ Source documentation directory (!docs) not found');
      return false;
    }

    if (!targetExists) {
      console.log('⚠️  Target documentation directory (backend/docs) not found');
      console.log('💡 Run: npm run docs:sync');
      return false;
    }

    // Simple check - compare directory contents
    const sourceFiles = await getFileList(DOCS_SOURCE);
    const targetFiles = await getFileList(DOCS_TARGET);

    if (sourceFiles.length !== targetFiles.length) {
      console.log('⚠️  Documentation appears to be out of sync');
      console.log(`📊 Source files: ${sourceFiles.length}, Target files: ${targetFiles.length}`);
      console.log('💡 Run: npm run docs:sync');
      return false;
    }

    console.log('✅ Documentation appears to be in sync');
    console.log(`📊 ${sourceFiles.length} files found`);
    return true;
  } catch (error) {
    console.error('❌ Error checking sync status:', error.message);
    return false;
  }
}

/**
 * Get list of all files in directory recursively
 */
async function getFileList(dir, fileList = []) {
  const files = await fs.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isDirectory()) {
      await getFileList(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'sync':
      await copyDocs();
      break;
    
    case 'watch':
      watchDocs();
      break;
    
    case 'check':
      await checkSync();
      break;
    
    default:
      console.log(`
📚 Itemize.cloud Documentation Sync Tool

Usage:
  node sync-docs.js sync    - Sync documentation once
  node sync-docs.js watch   - Watch for changes and auto-sync
  node sync-docs.js check   - Check if docs are in sync

NPM Scripts:
  npm run docs:sync         - Same as 'sync'
  npm run docs:watch        - Same as 'watch'
  npm run docs:check        - Same as 'check'

Examples:
  node sync-docs.js sync    # Manually sync docs
  node sync-docs.js watch   # Start watching for changes
  node sync-docs.js check   # Verify sync status

🔧 Development Workflow:
1. Make changes to files in !docs/
2. Run 'npm run docs:sync' or use watch mode
3. Test changes at http://localhost:3000/docs
4. Build with 'npm run build' (auto-syncs docs)
`);
      break;
  }
}

// Run main function
main().catch(console.error);

module.exports = { copyDocs, checkSync }; 