import { PDFDocument } from 'pdf-lib';
import {
  inspectSignaturePdf,
  SIGNATURE_PDF_MAX_PAGES,
  SignaturePdfValidationError,
} from './signature-pdf.validator';

describe('inspectSignaturePdf', () => {
  it('accepts a parseable, unencrypted PDF with bounded pages', async () => {
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    await expect(
      inspectSignaturePdf(Buffer.from(await document.save())),
    ).resolves.toEqual({ pageCount: 1 });
  });

  it('rejects a magic-byte spoof that is not a PDF', async () => {
    await expect(
      inspectSignaturePdf(Buffer.from('%PDF-1.7\nnot really a PDF')),
    ).rejects.toBeInstanceOf(SignaturePdfValidationError);
  });

  it('rejects excessive-page and extreme-dimension documents', async () => {
    const excessive = await PDFDocument.create();
    for (let index = 0; index <= SIGNATURE_PDF_MAX_PAGES; index += 1) {
      excessive.addPage([100, 100]);
    }
    await expect(
      inspectSignaturePdf(Buffer.from(await excessive.save())),
    ).rejects.toBeInstanceOf(SignaturePdfValidationError);

    const extreme = await PDFDocument.create();
    extreme.addPage([20_000, 100]);
    await expect(
      inspectSignaturePdf(Buffer.from(await extreme.save())),
    ).rejects.toBeInstanceOf(SignaturePdfValidationError);
  });
});
