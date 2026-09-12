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


describe('Invoice delivery attempt ownership', () => {
  const delivery = { id: 7, invoice_id: 9, status: 'processing', attempt_count: 2,
    payment_url: null, recipient_email: 'qa@example.invalid', subject: 'Invoice',
    payload: { invoice: { invoice_number: 'INV-9', amount_due: '10', currency: 'USD' }, settings: {},
      includePaymentLink: true, message: 'Review invoice', ccEmails: [] },
  } as unknown as InvoiceEmailDeliveryRow;
  const setup = () => {
    const repository = {
      prepareEmailDelivery: jest.fn().mockResolvedValue({kind:'replayed',delivery}),
      claimEmailDelivery: jest.fn().mockResolvedValue(delivery),
      findConnectedStripeAccountId: jest.fn().mockResolvedValue(null),
      recordPaymentLink: jest.fn().mockResolvedValue(null),
      findEmailDelivery: jest.fn().mockResolvedValue({...delivery,attempt_count:3}),
      completeEmailDelivery: jest.fn().mockResolvedValue({...delivery,attempt_count:3}),
    };
    const email = {send:jest.fn().mockResolvedValue({kind:'sent',providerId:'email-7'})};
    const links = {getOrCreate:jest.fn().mockResolvedValue({kind:'ready',sessionId:'cs-7',url:'https://pay.test/7'})};
    const pdf = {render:jest.fn().mockResolvedValue(Buffer.from('pdf'))};
    const activation = {recordArtifactSent:jest.fn()};
    const service = new InvoiceEmailDeliveryService(repository as unknown as InvoicesRepository,
      email as InvoiceEmailProvider, links as InvoicePaymentLinkProvider, pdf as InvoicePdfRenderer,
      activation as unknown as ActivationService);
    return {repository,email,pdf,activation,service};
  };
  const input = {idempotencyKey:'attempt-7',subject:'Invoice',message:'Review invoice',includePaymentLink:true,ccEmails:[],resend:false};
  it('stops before sending if another worker owns payment-link persistence', async () => {
    const {service,repository,email,pdf} = setup();
    await expect(service.send(1,2,9,input)).resolves.toMatchObject({emailSent:false,status:'processing'});
    expect(repository.recordPaymentLink).toHaveBeenCalledWith(1,7,'cs-7','https://pay.test/7',2);
    expect(email.send).not.toHaveBeenCalled();
    expect(pdf.render).not.toHaveBeenCalled();
  });
  it('does not record activation for a superseded completion', async () => {
    const {service,repository,activation} = setup();
    repository.claimEmailDelivery.mockResolvedValue({...delivery,payment_url:'https://pay.test/7'});
    await expect(service.send(1,2,9,input)).resolves.toMatchObject({emailSent:false,status:'processing'});
    expect(repository.completeEmailDelivery).toHaveBeenCalledWith(1,7,'email-7',2);
    expect(activation.recordArtifactSent).not.toHaveBeenCalled();
  });
});
