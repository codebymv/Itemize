const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High resolution for landing page
  });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('http://localhost:5173/login');

  console.log('Waiting for email input...');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  console.log('Filling credentials...');
  await page.fill('input[type="email"]', 'mevmusicofficial@gmail.com');
  await page.fill('input[type="password"]', 'M@tthew56565');

  console.log('Clicking login...');
  await page.evaluate(() => { document.querySelector('button[type="submit"]').click(); });

  console.log('Waiting for some UI to load...');
  await page.waitForTimeout(10000); // give it plenty of time

  console.log('Capturing full page...');
  const dir = path.join(__dirname, 'frontend/public/screenshots');
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
  }

  const screenshotPath = path.join(dir, 'dashboard.png');
  console.log(`Saving screenshot to ${screenshotPath}...`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  console.log('Screenshot saved successfully!');
  await browser.close();
})();
