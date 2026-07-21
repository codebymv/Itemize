import Stripe from 'stripe';
import { InvoiceWebhooksRepository } from './invoice-webhooks.repository';
import {
  InvoiceWebhooksService,
  StripeInvoiceWebhookInputError,
} from './invoice-webhooks.service';

const event = (object: Record<string, unknown>): Stripe.Event => ({
  id: 'evt_invoice_1',
  type: 'checkout.session.completed',
  data: { object },
} as unknown as Stripe.Event);

describe('InvoiceWebhooksService', () => {
  const repository = {
    process: jest.fn(),
  } as unknown as jest.Mocked<InvoiceWebhooksRepository>;
  const service = new InvoiceWebhooksService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.process.mockResolvedValue({
      received: true,
      duplicateEvent: false,
      handled: true,
    });
  });

  it('normalizes exact cents and bounded Stripe payment identity', async () => {
    await service.process(event({
      id: 'cs_invoice_1',
      payment_intent: 'pi_invoice_1',
      payment_status: 'paid',
      amount_total: 2606,
      currency: 'usd',
      metadata: { invoice_id: '12', organization_id: '4' },
    }));

    expect(repository.process).toHaveBeenCalledWith({
      id: 'evt_invoice_1',
      type: 'checkout.session.completed',
      session: {
        id: 'cs_invoice_1',
        invoiceId: 12,
        metadataOrganizationId: '4',
        paymentReference: 'pi_invoice_1',
        paymentStatus: 'paid',
        amount: '26.06',
        currency: 'USD',
      },
    });
  });

  it('acknowledges non-payable checkouts without inventing payment evidence', async () => {
    await service.process(event({
      id: 'cs_unpaid',
      payment_status: 'unpaid',
      metadata: {},
    }));

    expect(repository.process).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          invoiceId: null,
          amount: null,
          currency: null,
        }),
      }),
    );
  });

  it.each([
    { amount_total: -1, currency: 'usd', metadata: { invoice_id: '12' } },
    { amount_total: 1.5, currency: 'usd', metadata: { invoice_id: '12' } },
    { amount_total: 100, currency: 'US', metadata: { invoice_id: '12' } },
    { amount_total: 100, currency: 'usd', metadata: { invoice_id: '../12' } },
    { amount_total: 100, currency: 'usd', metadata: { invoice_id: '2147483648' } },
  ])('rejects malformed payable evidence before database work', async (invalid) => {
    await expect(service.process(event({
      id: 'cs_invalid',
      payment_intent: 'pi_invalid',
      payment_status: 'paid',
      ...invalid,
    }))).rejects.toBeInstanceOf(StripeInvoiceWebhookInputError);
    expect(repository.process).not.toHaveBeenCalled();
  });
});
