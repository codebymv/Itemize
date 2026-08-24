import { ActivationService } from '../activation/activation.service';
import { InvoiceEmailDeliveryService } from './invoice-email-delivery.service';
import {
  InvoiceEmailProvider,
  InvoicePaymentLinkProvider,
  InvoicePdfRenderer,
} from './invoice-delivery.providers';
import { InvoiceEmailDeliveryRow, InvoicesRepository } from './invoices.repository';

describe('InvoiceEmailDeliveryService rendering', () => {
  const service = new InvoiceEmailDeliveryService(
    {} as InvoicesRepository,
    {} as InvoiceEmailProvider,
    {} as InvoicePaymentLinkProvider,
    {} as InvoicePdfRenderer,
    {} as ActivationService,
  );
  const renderer = service as unknown as {
    html(delivery: InvoiceEmailDeliveryRow, paymentUrl: string | null): string;
    text(delivery: InvoiceEmailDeliveryRow, paymentUrl: string | null): string;
  };
  const delivery = {
    payload: { message: 'Your invoice is ready.' },
  } as InvoiceEmailDeliveryRow;

  it('omits the redundant attachment and security footer from every MIME variant', () => {
    const html = renderer.html(delivery, 'https://pay.example.test/invoice');
    const text = renderer.text(delivery, 'https://pay.example.test/invoice');

    expect(html).toContain('Your invoice is ready.');
    expect(html).toContain('Pay invoice');
    expect(html).not.toContain('Your invoice PDF');
    expect(html).not.toContain('Sent securely with Itemize');
    expect(html).not.toContain('background:#f8fafc;border-top:1px');
    expect(text).toBe(
      'Your invoice is ready.\n\nPay invoice: https://pay.example.test/invoice',
    );
  });
});
