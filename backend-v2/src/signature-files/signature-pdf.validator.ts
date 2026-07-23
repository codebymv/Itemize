import { PDFDocument } from 'pdf-lib';

export const SIGNATURE_PDF_MAX_PAGES = 200;
export const SIGNATURE_PDF_MAX_PAGE_POINTS = 14_400;

export type SignaturePdfInspection = {
  pageCount: number;
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
    return { pageCount: pages.length };
  } catch {
    throw new SignaturePdfValidationError();
  }
}
