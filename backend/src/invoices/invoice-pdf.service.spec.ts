import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InvoicePdfRenderer,
  InvoicePdfUnavailableError,
} from './invoice-delivery.providers';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesRepository } from './invoices.repository';

describe('InvoicePdfService', () => {
  const invoices = {
    findPdfSnapshot: jest.fn(),
  } as unknown as jest.Mocked<InvoicesRepository>;
  const renderer = {
    render: jest.fn(),
  } as jest.Mocked<InvoicePdfRenderer>;
  const service = new InvoicePdfService(invoices, renderer);
  const snapshot = {
    invoice: { id: 8, invoice_number: 'INV-00008', items: [] },
    settings: { business_name: 'Itemize Studio' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    invoices.findPdfSnapshot.mockResolvedValue(snapshot);
    renderer.render.mockResolvedValue(Buffer.from('%PDF-1.7\nrendered'));
  });

  it('renders the tenant snapshot and returns a safe attachment name', async () => {
    invoices.findPdfSnapshot.mockResolvedValue({
      ...snapshot,
      invoice: { ...snapshot.invoice, invoice_number: '../INV "8"\r\n' },
    });
    await expect(service.render(4, '8')).resolves.toEqual({
      buffer: Buffer.from('%PDF-1.7\nrendered'),
      filename: 'INV_8_.pdf',
    });
    expect(invoices.findPdfSnapshot).toHaveBeenCalledWith(4, 8);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      settings: { business_name: 'Itemize Studio' },
    }));
  });

  it('conceals invalid, missing, and foreign invoice identities as not found', async () => {
    for (const id of ['0', '-1', '1x', '']) {
      await expect(service.render(4, id)).rejects.toBeInstanceOf(NotFoundException);
    }
    invoices.findPdfSnapshot.mockResolvedValue(null);
    await expect(service.render(4, '8')).rejects.toBeInstanceOf(NotFoundException);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('distinguishes unavailable rendering from invalid renderer output', async () => {
    renderer.render.mockRejectedValueOnce(new InvoicePdfUnavailableError());
    await expect(service.render(4, '8')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    renderer.render.mockResolvedValueOnce(Buffer.from('not a pdf'));
    await expect(service.render(4, '8')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
