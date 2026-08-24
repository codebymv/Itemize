import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';
import { inflateSync } from 'node:zlib';

export const SIGNATURE_PDF_MAX_PAGES = 200;
export const SIGNATURE_PDF_MAX_PAGE_POINTS = 14_400;
export const SIGNATURE_PDF_MAX_OBJECTS = 50_000;
export const SIGNATURE_PDF_MAX_GRAPH_NODES = 100_000;
export const SIGNATURE_PDF_MAX_STREAMS = 10_000;
export const SIGNATURE_PDF_MAX_DICTIONARY_ENTRIES = 2_048;
export const SIGNATURE_PDF_MAX_ARRAY_ITEMS = 10_000;
export const SIGNATURE_PDF_MAX_DECODED_STREAM_BYTES = 20 * 1024 * 1024;
export const SIGNATURE_PDF_MAX_TOTAL_DECODED_BYTES = 100 * 1024 * 1024;
export const SIGNATURE_PDF_MAX_COMPRESSION_RATIO = 200;
export const SIGNATURE_PDF_MAX_IMAGE_PIXELS = 40_000_000;
export const SIGNATURE_PDF_MAX_TOTAL_IMAGE_PIXELS = 100_000_000;

export type SignaturePdfInspection = {
  pageCount: number;
  objectCount: number;
  streamCount: number;
  decodedStreamBytes: number;
  imagePixels: number;
};

export class SignaturePdfValidationError extends Error {
  constructor() {
    super('Invalid PDF file content');
    this.name = 'SignaturePdfValidationError';
  }
}

export async function inspectSignaturePdf(
  buffer: Buffer,
): Promise<SignaturePdfInspection> {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new SignaturePdfValidationError();
  }
  try {
    const document = await PDFDocument.load(buffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const indirect = document.context.enumerateIndirectObjects();
    if (indirect.length > SIGNATURE_PDF_MAX_OBJECTS) {
      throw new SignaturePdfValidationError();
    }
    const pages = document.getPages();
    if (pages.length < 1 || pages.length > SIGNATURE_PDF_MAX_PAGES) {
      throw new SignaturePdfValidationError();
    }
    for (const page of pages) {
      const { width, height } = page.getSize();
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        width > SIGNATURE_PDF_MAX_PAGE_POINTS ||
        height > SIGNATURE_PDF_MAX_PAGE_POINTS
      ) {
        throw new SignaturePdfValidationError();
      }
    }
    const complexity = inspectObjectGraph(document, indirect);
    return { pageCount: pages.length, objectCount: indirect.length, ...complexity };
  } catch {
    throw new SignaturePdfValidationError();
  }
}

const forbiddenNames = new Set([
  'AA',
  'AcroForm',
  'EmbeddedFile',
  'EmbeddedFiles',
  'Filespec',
  'ImportData',
  'JavaScript',
  'JS',
  'Launch',
  'OpenAction',
  'RichMedia',
  'SubmitForm',
  'XFA',
]);

function inspectObjectGraph(
  document: PDFDocument,
  indirect: Array<[PDFRef, PDFObject]>,
): Omit<SignaturePdfInspection, 'pageCount' | 'objectCount'> {
  const seen = new Set<PDFObject>();
  let graphNodes = 0;
  let streamCount = 0;
  let decodedStreamBytes = 0;
  let imagePixels = 0;

  const resolved = (value: PDFObject | undefined): PDFObject | undefined =>
    value ? document.context.lookup(value) : undefined;
  const name = (value: PDFObject | undefined): string | null => {
    const candidate = resolved(value);
    return candidate instanceof PDFName ? candidate.decodeText() : null;
  };
  const number = (dict: PDFDict, key: string): number | null => {
    const candidate = resolved(dict.get(PDFName.of(key)));
    return candidate instanceof PDFNumber ? candidate.asNumber() : null;
  };
  const filterNames = (dict: PDFDict): string[] => {
    const filter = resolved(dict.get(PDFName.of('Filter')));
    if (!filter) return [];
    const values = filter instanceof PDFArray ? filter.asArray() : [filter];
    return values.map((value) => {
      const candidate = resolved(value);
      if (!(candidate instanceof PDFName)) {
        throw new SignaturePdfValidationError();
      }
      return candidate.decodeText();
    });
  };
  const visit = (value: PDFObject, depth: number): void => {
    if (value instanceof PDFRef || seen.has(value)) return;
    if (depth > 64 || ++graphNodes > SIGNATURE_PDF_MAX_GRAPH_NODES) {
      throw new SignaturePdfValidationError();
    }
    seen.add(value);
    if (value instanceof PDFName) {
      if (forbiddenNames.has(value.decodeText())) {
        throw new SignaturePdfValidationError();
      }
      return;
    }
    if (value instanceof PDFArray) {
      if (value.size() > SIGNATURE_PDF_MAX_ARRAY_ITEMS) {
        throw new SignaturePdfValidationError();
      }
      for (const child of value.asArray()) visit(child, depth + 1);
      return;
    }
    const dict = value instanceof PDFStream
      ? value.dict
      : value instanceof PDFDict
        ? value
        : null;
    if (!dict) return;
    if (dict.entries().length > SIGNATURE_PDF_MAX_DICTIONARY_ENTRIES) {
      throw new SignaturePdfValidationError();
    }
    for (const [key, child] of dict.entries()) {
      if (forbiddenNames.has(key.decodeText())) {
        throw new SignaturePdfValidationError();
      }
      visit(child, depth + 1);
    }
    if (!(value instanceof PDFStream)) return;
    if (++streamCount > SIGNATURE_PDF_MAX_STREAMS) {
      throw new SignaturePdfValidationError();
    }
    const image =
      name(dict.get(PDFName.of('Subtype'))) === 'Image'
      || name(dict.get(PDFName.of('Type'))) === 'Image';
    if (image) {
      const width = number(dict, 'Width');
      const height = number(dict, 'Height');
      if (
        width === null
        || height === null
        || !Number.isSafeInteger(width)
        || !Number.isSafeInteger(height)
        || width <= 0
        || height <= 0
      ) {
        throw new SignaturePdfValidationError();
      }
      const pixels = width * height;
      imagePixels += pixels;
      if (
        !Number.isSafeInteger(pixels)
        || pixels > SIGNATURE_PDF_MAX_IMAGE_PIXELS
        || imagePixels > SIGNATURE_PDF_MAX_TOTAL_IMAGE_PIXELS
      ) {
        throw new SignaturePdfValidationError();
      }
    }
    if (!(value instanceof PDFRawStream)) return;
    const filters = filterNames(dict);
    const allowedFilters = image
      ? new Set([
          'CCF',
          'CCITTFaxDecode',
          'DCT',
          'DCTDecode',
          'Fl',
          'FlateDecode',
          'JPXDecode',
        ])
      : new Set(['Fl', 'FlateDecode']);
    if (filters.some((filter) => !allowedFilters.has(filter))) {
      throw new SignaturePdfValidationError();
    }
    const soleFlateFilter = filters.length === 1
      && (filters[0] === 'FlateDecode' || filters[0] === 'Fl');
    if (!soleFlateFilter) return;
    const decoded = inflateSync(value.contents, {
      maxOutputLength: SIGNATURE_PDF_MAX_DECODED_STREAM_BYTES,
    });
    decodedStreamBytes += decoded.length;
    const ratio = decoded.length / Math.max(1, value.contents.length);
    if (
      decodedStreamBytes > SIGNATURE_PDF_MAX_TOTAL_DECODED_BYTES
      || ratio > SIGNATURE_PDF_MAX_COMPRESSION_RATIO
    ) {
      throw new SignaturePdfValidationError();
    }
  };

  for (const [, object] of indirect) visit(object, 0);
  return { streamCount, decodedStreamBytes, imagePixels };
}
