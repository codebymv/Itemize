const {
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFRawStream,
    PDFRef,
    PDFStream,
} = require('pdf-lib');
const { inflateSync } = require('zlib');

const LIMITS = Object.freeze({
    pages: 200,
    pagePoints: 14_400,
    objects: 50_000,
    graphNodes: 100_000,
    streams: 10_000,
    dictionaryEntries: 2_048,
    arrayItems: 10_000,
    decodedStreamBytes: 20 * 1024 * 1024,
    totalDecodedBytes: 100 * 1024 * 1024,
    compressionRatio: 200,
    imagePixels: 40_000_000,
    totalImagePixels: 100_000_000,
});

const FORBIDDEN_NAMES = new Set([
    'AA', 'AcroForm', 'EmbeddedFile', 'EmbeddedFiles', 'Filespec',
    'ImportData', 'JavaScript', 'JS', 'Launch', 'OpenAction', 'RichMedia',
    'SubmitForm', 'XFA',
]);

class SignaturePdfValidationError extends Error {
    constructor() {
        super('Invalid PDF file content');
        this.code = 'INVALID_FILE_CONTENT';
    }
}

async function inspectSignaturePdf(buffer) {
    if (!Buffer.isBuffer(buffer)
        || buffer.length < 5
        || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new SignaturePdfValidationError();
    }
    try {
        const document = await PDFDocument.load(buffer, {
            ignoreEncryption: false,
            updateMetadata: false,
        });
        const indirect = document.context.enumerateIndirectObjects();
        if (indirect.length > LIMITS.objects) throw new SignaturePdfValidationError();
        const pages = document.getPages();
        if (pages.length < 1 || pages.length > LIMITS.pages) {
            throw new SignaturePdfValidationError();
        }
        for (const page of pages) {
            const { width, height } = page.getSize();
            if (!Number.isFinite(width) || !Number.isFinite(height)
                || width <= 0 || height <= 0
                || width > LIMITS.pagePoints || height > LIMITS.pagePoints) {
                throw new SignaturePdfValidationError();
            }
        }
        return {
            pageCount: pages.length,
            objectCount: indirect.length,
            ...inspectObjectGraph(document, indirect),
        };
    } catch {
        throw new SignaturePdfValidationError();
    }
}

function inspectObjectGraph(document, indirect) {
    const seen = new Set();
    let graphNodes = 0;
    let streamCount = 0;
    let decodedStreamBytes = 0;
    let imagePixels = 0;
    const resolved = value => value ? document.context.lookup(value) : undefined;
    const name = value => {
        const candidate = resolved(value);
        return candidate instanceof PDFName ? candidate.decodeText() : null;
    };
    const number = (dict, key) => {
        const candidate = resolved(dict.get(PDFName.of(key)));
        return candidate instanceof PDFNumber ? candidate.asNumber() : null;
    };
    const filterNames = dict => {
        const filter = resolved(dict.get(PDFName.of('Filter')));
        if (!filter) return [];
        const values = filter instanceof PDFArray ? filter.asArray() : [filter];
        return values.map(value => {
            const candidate = resolved(value);
            if (!(candidate instanceof PDFName)) throw new SignaturePdfValidationError();
            return candidate.decodeText();
        });
    };
    const visit = (value, depth) => {
        if (value instanceof PDFRef || seen.has(value)) return;
        if (depth > 64 || ++graphNodes > LIMITS.graphNodes) {
            throw new SignaturePdfValidationError();
        }
        seen.add(value);
        if (value instanceof PDFName) {
            if (FORBIDDEN_NAMES.has(value.decodeText())) {
                throw new SignaturePdfValidationError();
            }
            return;
        }
        if (value instanceof PDFArray) {
            if (value.size() > LIMITS.arrayItems) throw new SignaturePdfValidationError();
            for (const child of value.asArray()) visit(child, depth + 1);
            return;
        }
        const dict = value instanceof PDFStream
            ? value.dict
            : value instanceof PDFDict ? value : null;
        if (!dict) return;
        if (dict.entries().length > LIMITS.dictionaryEntries) {
            throw new SignaturePdfValidationError();
        }
        for (const [key, child] of dict.entries()) {
            if (FORBIDDEN_NAMES.has(key.decodeText())) {
                throw new SignaturePdfValidationError();
            }
            visit(child, depth + 1);
        }
        if (!(value instanceof PDFStream)) return;
        if (++streamCount > LIMITS.streams) throw new SignaturePdfValidationError();
        const image = name(dict.get(PDFName.of('Subtype'))) === 'Image'
            || name(dict.get(PDFName.of('Type'))) === 'Image';
        if (image) {
            const width = number(dict, 'Width');
            const height = number(dict, 'Height');
            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
                || width <= 0 || height <= 0) {
                throw new SignaturePdfValidationError();
            }
            const pixels = width * height;
            imagePixels += pixels;
            if (!Number.isSafeInteger(pixels)
                || pixels > LIMITS.imagePixels
                || imagePixels > LIMITS.totalImagePixels) {
                throw new SignaturePdfValidationError();
            }
        }
        if (!(value instanceof PDFRawStream)) return;
        const filters = filterNames(dict);
        const allowedFilters = image
            ? new Set([
                'CCF', 'CCITTFaxDecode', 'DCT', 'DCTDecode',
                'Fl', 'FlateDecode', 'JPXDecode',
            ])
            : new Set(['Fl', 'FlateDecode']);
        if (filters.some(filter => !allowedFilters.has(filter))) {
            throw new SignaturePdfValidationError();
        }
        if (filters.length !== 1
            || (filters[0] !== 'FlateDecode' && filters[0] !== 'Fl')) return;
        const decoded = inflateSync(value.contents, {
            maxOutputLength: LIMITS.decodedStreamBytes,
        });
        decodedStreamBytes += decoded.length;
        if (decodedStreamBytes > LIMITS.totalDecodedBytes
            || decoded.length / Math.max(1, value.contents.length) > LIMITS.compressionRatio) {
            throw new SignaturePdfValidationError();
        }
    };
    for (const [, object] of indirect) visit(object, 0);
    return { streamCount, decodedStreamBytes, imagePixels };
}

module.exports = {
    inspectSignaturePdf,
    LIMITS,
    SignaturePdfValidationError,
};
