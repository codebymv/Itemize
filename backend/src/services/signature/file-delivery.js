const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
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
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${disposition}; filename="${safeFilename(filename)}"`,
        'Content-Security-Policy': 'sandbox',
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
    };
}

function strongEtag(hash) {
    return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)
        ? `"sha256-${hash.toLowerCase()}"` : null;
}

function notModified(header, etag) {
    if (!header || !etag) return false;
    return String(header).split(',').some(candidate => {
        const normalized = candidate.trim();
        return normalized === '*' || (etag && (
            normalized === etag || normalized.replace(/^W\//, '') === etag
        ));
    });
}

function effectiveRange(options, etag) {
    if (!options.range) return null;
    if (!options.ifRange) return options.range;
    return etag && String(options.ifRange).trim() === etag ? options.range : null;
}

function parseRange(header, totalLength) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!match || (!match[1] && !match[2]) || totalLength === 0) return false;
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
        return { start: Math.max(totalLength - suffixLength, 0), end: totalLength - 1 };
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : totalLength - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
        || start < 0 || requestedEnd < start || start >= totalLength) {
        return false;
    }
    return { start, end: Math.min(requestedEnd, totalLength - 1) };
}

function prepareResponse(res, options, totalLength) {
    const etag = strongEtag(options.sha256);
    const headers = {
        ...fileHeaders(options.filename, options.disposition),
        ...(etag ? { ETag: etag } : {}),
        ...(options.publicCapability ? {
            'Referrer-Policy': 'no-referrer',
            'X-Robots-Tag': 'noindex, nofollow',
        } : {}),
    };
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (notModified(options.ifNoneMatch, etag)) {
        res.status(304).end();
        return { completed: true, range: null };
    }
    const range = parseRange(effectiveRange(options, etag), totalLength);
    if (range === false) {
        res.setHeader('Content-Range', `bytes */${totalLength}`);
        res.status(416).end();
        return { completed: true, range: null };
    }
    if (range) {
        res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${totalLength}`);
        res.setHeader('Content-Length', String(range.end - range.start + 1));
        res.status(206);
    } else {
        res.setHeader('Content-Length', String(totalLength));
        res.status(200);
    }
    return { completed: false, range };
}

async function sendSignatureFile(res, fileUrl, options = {}) {
    const localPath = getLocalFilePath(fileUrl);
    if (localPath) {
        let metadata;
        try {
            metadata = await fs.promises.stat(localPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            return false;
        }
        const prepared = prepareResponse(res, options, metadata.size);
        if (prepared.completed) return true;
        const stream = fs.createReadStream(localPath, prepared.range || undefined);
        await pipeline(stream, res);
        return true;
    }

    const key = getS3KeyFromUrl(fileUrl);
    if (!key) return false;

    let metadata;
    try {
        metadata = await s3Service.headFile(key);
    } catch (error) {
        if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return false;
        throw error;
    }
    const totalLength = Number(metadata?.ContentLength);
    if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
        throw new Error('Signature file storage returned an invalid length');
    }
    const prepared = prepareResponse(res, options, totalLength);
    if (prepared.completed) return true;
    const response = await s3Service.getFile(key, prepared.range ? {
        range: `bytes=${prepared.range.start}-${prepared.range.end}`,
    } : {});
    if (!response?.Body) return false;
    await pipeline(response.Body, res);
    return true;
}

module.exports = {
    effectiveRange,
    fileHeaders,
    notModified,
    parseRange,
    safeFilename,
    sendSignatureFile,
    strongEtag,
};
