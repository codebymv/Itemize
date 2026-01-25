/**
 * Puppeteer configuration for Railway/Docker environments
 * This file tells puppeteer to skip downloading Chrome when PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is set
 */
const { join } = require('path');

/** @type {import("puppeteer").Configuration} */
module.exports = {
    // Skip chromium download if env var is set (Railway provides its own)
    skipDownload: !!process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD,
    
    // Cache directory for puppeteer
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
