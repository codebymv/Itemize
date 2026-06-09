const { logger } = require('../../utils/logger');

let puppeteer = null;

try {
    puppeteer = require('puppeteer');
    logger.info('Puppeteer loaded - PDF generation enabled');
} catch (e) {
    logger.warn('Puppeteer not available - PDF generation will be disabled');
    logger.warn('Error:', e.message);
}

async function generatePDF(html) {
    if (!puppeteer) {
        throw new Error('PDF generation not available - puppeteer not installed');
    }

    let browser = null;
    
    try {
        logger.info('Launching Puppeteer browser for PDF generation...');
        
        // Get Chrome path from environment (set by Dockerfile)
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        if (executablePath) {
            logger.info(`Using Chrome from: ${executablePath}`);
        }
        
        // Launch browser with args optimized for Docker/Railway
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        };
        
        // Use system Chrome if path is provided
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }
        
        browser = await puppeteer.launch(launchOptions);

        logger.info('Browser launched, creating page...');
        const page = await browser.newPage();
        
        // Set content and wait for everything to load
        await page.setContent(html, { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 30000
        });

        // Wait for fonts to load (including Raleway from Google Fonts)
        await page.evaluate(() => {
            return document.fonts.ready.then(() => {
                // Additional check to ensure Raleway is loaded
                const ralewayLoaded = document.fonts.check('1em Raleway');
                if (!ralewayLoaded) {
                    console.warn('Raleway font may not be loaded yet');
                }
                return Promise.resolve();
            });
        });
        
        // Wait for all images to load
        await page.evaluate(() => {
            return Promise.all(
                Array.from(document.images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = () => {
                            console.warn('Image failed to load:', img.src);
                            resolve(); // Resolve anyway to continue
                        };
                        // Timeout after 5 seconds
                        setTimeout(() => {
                            console.warn('Image load timeout:', img.src);
                            resolve();
                        }, 5000);
                    });
                })
            );
        });
        
        // Small delay to ensure fonts and images are fully rendered
        await new Promise(resolve => setTimeout(resolve, 1000));

        logger.info('Page content set, generating PDF...');
        
        // Generate PDF - Letter format (8.5x11 inches)
        const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '15mm',
                right: '15mm',
                bottom: '15mm',
                left: '15mm'
            }
        });

        logger.info(`PDF generated successfully, size: ${pdf.length} bytes`);
        return Buffer.from(pdf);
    } catch (error) {
        logger.error('Error in generatePDF:', error);
        logger.error('Stack trace:', error.stack);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            logger.info('Browser closed');
        }
    }
}

/**
 * Generate invoice PDF
 */

function isPDFAvailable() {
    return puppeteer !== null;
}

module.exports = {
    generatePDF,
    isPDFAvailable
};
