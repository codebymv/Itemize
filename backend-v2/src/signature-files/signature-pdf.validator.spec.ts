import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
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
    ).resolves.toMatchObject({
      pageCount: 1,
      objectCount: expect.any(Number),
      streamCount: expect.any(Number),
      decodedStreamBytes: expect.any(Number),
      imagePixels: 0,
    });
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

  it('rejects active actions, scripts, forms, and embedded-file markers', async () => {
    for (const forbidden of ['OpenAction', 'JavaScript', 'AcroForm', 'EmbeddedFiles']) {
      const document = await PDFDocument.create();
      document.addPage([612, 792]);
      document.catalog.set(PDFName.of(forbidden), PDFName.of('Blocked'));
      await expect(
        inspectSignaturePdf(Buffer.from(await document.save())),
      ).rejects.toBeInstanceOf(SignaturePdfValidationError);
    }
  });

  it('rejects extreme Flate expansion and oversized embedded images', async () => {
    const compressed = await PDFDocument.create();
    const page = compressed.addPage([612, 792]);
    const stream = PDFRawStream.of(
      compressed.context.obj({ Filter: 'FlateDecode' }),
      deflateSync(Buffer.alloc(2 * 1024 * 1024, 65)),
    );
    page.node.set(PDFName.Contents, compressed.context.register(stream));
    await expect(
      inspectSignaturePdf(Buffer.from(await compressed.save({
        useObjectStreams: false,
      }))),
    ).rejects.toBeInstanceOf(SignaturePdfValidationError);

    const oversizedImage = await PDFDocument.create();
    oversizedImage.addPage([612, 792]);
    oversizedImage.context.register(PDFRawStream.of(
      oversizedImage.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: 10_000,
        Height: 10_000,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
      }),
      new Uint8Array([0]),
    ));
    await expect(
      inspectSignaturePdf(Buffer.from(await oversizedImage.save({
        useObjectStreams: false,
      }))),
    ).rejects.toBeInstanceOf(SignaturePdfValidationError);
  });
});
