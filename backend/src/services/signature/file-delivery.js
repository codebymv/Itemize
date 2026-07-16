const path = require('path');
const fs = require('fs');
const s3Service = require('../s3.service');
const { getLocalFilePath, getS3KeyFromUrl } = require('./storage');

function safeFilename(value, fallback = 'document.pdf') {
    const normalized = path.basename(String(value || fallback))
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 150);
    const base = normalized || fallback;
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function fileHeaders(filename, disposition = 'inline') {
    return {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${disposition}; filename="${safeFilename(filename)}"`,
        'Content-Security-Policy': 'sandbox',
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
    };
}

async function sendSignatureFile(res, fileUrl, options = {}) {
    const headers = fileHeaders(options.filename, options.disposition);
    const localPath = getLocalFilePath(fileUrl);
    if (localPath) {
        try {
            await fs.promises.access(localPath, fs.constants.R_OK);
        } catch {
            return false;
        }
        res.sendFile(localPath, { headers });
        return true;
    }

    const key = getS3KeyFromUrl(fileUrl);
    if (!key) return false;

    const response = await s3Service.getFile(key);
    if (!response?.Body) return false;
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (response.ContentLength !== undefined) {
        res.setHeader('Content-Length', String(response.ContentLength));
    }
    response.Body.on('error', error => {
        if (!res.headersSent) res.status(502).end();
        else res.destroy(error);
    });
    response.Body.pipe(res);
    return true;
}

module.exports = { fileHeaders, safeFilename, sendSignatureFile };
