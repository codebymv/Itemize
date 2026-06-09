const { logger } = require('../../utils/logger');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const serviceDir = path.join(__dirname, '..');

const fileExistsAsync = async (filePath) => {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount || 0);
}

/**
 * Format date - matches frontend exactly (handles timezone issues)
 */
function formatDate(dateInput) {
    if (!dateInput) return '';
    
    let date;
    
    // Handle Date objects
    if (dateInput instanceof Date) {
        date = dateInput;
    } else {
        // Convert to string if needed
        const dateStr = String(dateInput);
        
        // Handle ISO strings and YYYY-MM-DD format
        if (dateStr.includes('T')) {
            // For ISO strings, extract just the date part to avoid timezone shifts
            const datePart = dateStr.split('T')[0];
            const [year, month, day] = datePart.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else if (dateStr.includes('-')) {
            const [year, month, day] = dateStr.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else {
            // Fallback: try to parse as-is
            date = new Date(dateStr);
        }
    }
    
    // Check for invalid date
    if (isNaN(date.getTime())) {
        return '';
    }
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Convert image URL to base64 data URL for reliable PDF embedding
 * This ensures Puppeteer can always load the image
 */
async function convertImageToDataUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // If already a data URL, return as-is
    if (imageUrl.startsWith('data:')) {
        return imageUrl;
    }
    
    try {
        // Normalize URL
        let url = imageUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.startsWith('/uploads/')) {
                const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
                url = `${baseUrl}${url}`;
            } else if (url.includes('.s3.') && !url.startsWith('http')) {
                url = `https://${url}`;
            } else {
                return url; // Return as-is if we can't normalize
            }
        }
        
        logger.info(`Fetching image for PDF: ${url}`);
        
        // Fetch image and convert to base64
        const imageBuffer = await new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to fetch image: ${response.statusCode}`));
                    return;
                }
                
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
            }).on('error', reject);
        });
        
        // Determine content type from URL or response
        let contentType = 'image/png'; // default
        if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
        else if (url.includes('.gif')) contentType = 'image/gif';
        else if (url.includes('.webp')) contentType = 'image/webp';
        
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        logger.info(`Image converted to data URL, size: ${base64.length} chars`);
        return dataUrl;
    } catch (error) {
        logger.warn(`Failed to convert image to data URL: ${error.message}, using original URL`);
        return imageUrl; // Fallback to original URL
    }
}

/**
 * Normalize logo URL to absolute URL for Puppeteer
 * Converts relative paths to absolute URLs
 */
function normalizeLogoUrl(logoUrl) {
    if (!logoUrl) return null;
    
    // If already absolute URL (http/https), return as-is
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        return logoUrl;
    }
    
    // If relative path starting with /uploads/, convert to absolute URL
    if (logoUrl.startsWith('/uploads/')) {
        // Use API_URL or FRONTEND_URL from environment, fallback to localhost
        const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
        return `${baseUrl}${logoUrl}`;
    }
    
    // If it's an S3 URL without protocol (shouldn't happen, but handle it)
    if (logoUrl.includes('.s3.') && !logoUrl.startsWith('http')) {
        return `https://${logoUrl}`;
    }
    
    // Return as-is for other cases
    return logoUrl;
}

/**
 * Load itemize.cloud logo for footer
 * Returns base64 data URL of the logo
 * Caches the result to avoid reading file multiple times
 */
let cachedLogoDataUrl = null;
let cachedIconDataUrl = null;
let cachedTextWhiteDataUrl = null;
let cachedTextBlackDataUrl = null;

async function getItemizeLogoAsync() {
    // Return cached version if available
    if (cachedLogoDataUrl !== null) {
        return cachedLogoDataUrl;
    }
    
    try {
        // Try to load from frontend public directory (local development)
        const logoPath = path.join(serviceDir, '../../frontend/public/cover.png');
        try {
            const logoBuffer = await fs.promises.readFile(logoPath);
            const base64 = logoBuffer.toString('base64');
            cachedLogoDataUrl = `data:image/png;base64,${base64}`;
            logger.info('Itemize logo loaded from local file');
            return cachedLogoDataUrl;
        } catch { /* file does not exist, continue to fallback */ }
        
        // Fallback: try relative to backend
        const altPath = path.join(serviceDir, '../public/cover.png');
        try {
            const logoBuffer = await fs.promises.readFile(altPath);
            const base64 = logoBuffer.toString('base64');
            cachedLogoDataUrl = `data:image/png;base64,${base64}`;
            logger.info('Itemize logo loaded from backend public directory');
            return cachedLogoDataUrl;
        } catch { /* file does not exist, continue to fallback */ }
        
        // In production (Railway), we might need to fetch from URL
        // For now, return null and use text fallback
        logger.warn('Itemize logo not found locally, footer will be text-only');
        cachedLogoDataUrl = false; // Cache false to avoid repeated checks
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize logo: ${error.message}`);
        cachedLogoDataUrl = false;
        return null;
    }
}

async function getItemizeIconAsync() {
    // Return cached version if available
    if (cachedIconDataUrl !== null && cachedIconDataUrl !== false) {
        return cachedIconDataUrl;
    }
    
    try {
        // Try multiple possible paths
        const possiblePaths = [
            path.join(serviceDir, '../../frontend/public/icon.png'),
            path.join(serviceDir, '../../../frontend/public/icon.png'),
            path.join(serviceDir, '../public/icon.png'),
            path.join(process.cwd(), 'frontend/public/icon.png'),
            path.join(process.cwd(), 'public/icon.png')
        ];
        
        for (const iconPath of possiblePaths) {
            try {
                if (await fileExistsAsync(iconPath)) {
                    const iconBuffer = await fs.promises.readFile(iconPath);
                    const base64 = iconBuffer.toString('base64');
                    cachedIconDataUrl = `data:image/png;base64,${base64}`;
                    logger.info(`Itemize icon loaded from filesystem: ${iconPath}`);
                    return cachedIconDataUrl;
                }
            } catch (_e) { /* continue loop */ }
        }
        
        // Fallback: try to fetch via HTTP (for production environments)
        const baseUrl = process.env.FRONTEND_URL || process.env.API_URL || 'http://localhost:5173';
        const httpUrl = `${baseUrl}/icon.png`;
        logger.info(`Trying to fetch itemize icon via HTTP: ${httpUrl}`);
        const iconDataUrl = await convertImageToDataUrl(httpUrl);
        if (iconDataUrl && iconDataUrl.startsWith('data:')) {
            cachedIconDataUrl = iconDataUrl;
            logger.info('Itemize icon loaded via HTTP');
            return cachedIconDataUrl;
        }
        
        logger.warn('Itemize icon not found in any expected location');
        cachedIconDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize icon: ${error.message}`);
        logger.warn(`Error stack: ${error.stack}`);
        cachedIconDataUrl = false;
        return null;
    }
}

function getItemizeIcon() {
    // Synchronous version for backward compatibility
    // This will only work if already cached
    if (cachedIconDataUrl !== null && cachedIconDataUrl !== false) {
        return cachedIconDataUrl;
    }
    // If not cached, return null (will be loaded async)
    return null;
}

async function getItemizeTextWhiteAsync() {
    // Return cached version if available
    if (cachedTextWhiteDataUrl !== null) {
        return cachedTextWhiteDataUrl;
    }
    
    try {
        // Try to load from frontend public directory (local development)
        const textPath = path.join(serviceDir, '../../frontend/public/textwhite.png');
        try {
            const textBuffer = await fs.promises.readFile(textPath);
            const base64 = textBuffer.toString('base64');
            cachedTextWhiteDataUrl = `data:image/png;base64,${base64}`;
            return cachedTextWhiteDataUrl;
        } catch { /* file does not exist, continue to fallback */ }
        
        // Fallback: try relative to backend
        const altPath = path.join(serviceDir, '../public/textwhite.png');
        try {
            const textBuffer = await fs.promises.readFile(altPath);
            const base64 = textBuffer.toString('base64');
            cachedTextWhiteDataUrl = `data:image/png;base64,${base64}`;
            return cachedTextWhiteDataUrl;
        } catch { /* file does not exist, continue to fallback */ }
        
        cachedTextWhiteDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize text white: ${error.message}`);
        cachedTextWhiteDataUrl = false;
        return null;
    }
}

async function getItemizeTextBlackAsync() {
    // Return cached version if available
    if (cachedTextBlackDataUrl !== null && cachedTextBlackDataUrl !== false) {
        return cachedTextBlackDataUrl;
    }
    
    try {
        // Try multiple possible paths
        const possiblePaths = [
            path.join(serviceDir, '../../frontend/public/textblack.png'),
            path.join(serviceDir, '../../../frontend/public/textblack.png'),
            path.join(serviceDir, '../public/textblack.png'),
            path.join(process.cwd(), 'frontend/public/textblack.png'),
            path.join(process.cwd(), 'public/textblack.png')
        ];
        
        for (const textPath of possiblePaths) {
            try {
                if (await fileExistsAsync(textPath)) {
                    const textBuffer = await fs.promises.readFile(textPath);
                    const base64 = textBuffer.toString('base64');
                    cachedTextBlackDataUrl = `data:image/png;base64,${base64}`;
                    logger.info(`Itemize text black loaded from filesystem: ${textPath}`);
                    return cachedTextBlackDataUrl;
                }
            } catch (_e) { /* continue loop */ }
        }
        
        // Fallback: try to fetch via HTTP (for production environments)
        const baseUrl = process.env.FRONTEND_URL || process.env.API_URL || 'http://localhost:5173';
        const httpUrl = `${baseUrl}/textblack.png`;
        logger.info(`Trying to fetch itemize text black via HTTP: ${httpUrl}`);
        const textDataUrl = await convertImageToDataUrl(httpUrl);
        if (textDataUrl && textDataUrl.startsWith('data:')) {
            cachedTextBlackDataUrl = textDataUrl;
            logger.info('Itemize text black loaded via HTTP');
            return cachedTextBlackDataUrl;
        }
        
        logger.warn('Itemize text black not found in any expected location');
        cachedTextBlackDataUrl = false;
        return null;
    } catch (error) {
        logger.warn(`Failed to load itemize text black: ${error.message}`);
        logger.warn(`Error stack: ${error.stack}`);
        cachedTextBlackDataUrl = false;
        return null;
    }
}

function getItemizeTextBlack() {
    // Synchronous version for backward compatibility
    // This will only work if already cached
    if (cachedTextBlackDataUrl !== null && cachedTextBlackDataUrl !== false) {
        return cachedTextBlackDataUrl;
    }
    // If not cached, return null (will be loaded async)
    return null;
}

/**
 * Generate invoice HTML template
 * This is the EXACT same layout as the frontend InvoicePreview component
 * Any changes here should be mirrored in the frontend preview
 */

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate PDF from HTML using Puppeteer
 */

module.exports = {
    formatCurrency,
    formatDate,
    convertImageToDataUrl,
    normalizeLogoUrl,
    getItemizeLogoAsync,
    getItemizeIconAsync,
    getItemizeIcon,
    getItemizeTextWhiteAsync,
    getItemizeTextBlackAsync,
    getItemizeTextBlack,
    escapeHtml
};
