import {
  RecurringInvoiceRow,
  RecurringInvoicesRepository,
} from './recurring-invoices.repository';
import { RecurringInvoicesService } from './recurring-invoices.service';

const row = (values: Partial<RecurringInvoiceRow> = {}): RecurringInvoiceRow => ({
  id: 8,
  organization_id: 4,
  template_name: 'Monthly retainer',
  contact_id: 9,
  customer_name: 'Ada Lovelace',
  customer_email: 'ada@example.com',
  customer_phone: null,
  customer_address: null,
  frequency: 'monthly',
  start_date: '2026-08-01',
  end_date: null,
  next_run_date: '2026-09-01',
  last_generated_at: null,
  status: 'active',
  items: [],
  subtotal: '125.00',
  tax_amount: '0.00',
  discount_amount: '0.00',
  discount_type: null,
  discount_value: '0.00',
  total: '125.00',
  currency: 'USD',
  notes: null,
  payment_terms: null,
  custom_fields: {},
  source_invoice_id: null,
  created_by: 7,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-01T00:00:00.000Z'),
  contact_first_name: 'Ada',
  contact_last_name: 'Lovelace',
  contact_email: 'ada@example.com',
  source_invoice_number: null,
  invoices_generated: '2',
  ...values,
});

describe('RecurringInvoicesService', () => {
  let repository: jest.Mocked<RecurringInvoicesRepository>;
  let service: RecurringInvoicesService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
    } as unknown as jest.Mocked<RecurringInvoicesRepository>;
    service = new RecurringInvoicesService(repository);
  });

  it('scopes, escapes, filters, pages, and maps recurring schedule reads', async () => {
    repository.findPage.mockResolvedValue({
      rows: [row()],
      total: '1',
      stats: { total: '12', active: '8', paused: '3', completed: '1' },
    });

    await expect(service.list(
      4,
      { status: 'active', search: '  50%_Ada  ' },
      { page: 2, pageSize: 10 },
    )).resolves.toMatchObject({
      nodes: [{ id: 8, templateName: 'Monthly retainer', total: '125.00' }],
      pageInfo: { page: 2, pageSize: 10, total: 1 },
      stats: { total: 12, active: 8, paused: 3, completed: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      status: 'active',
      searchPattern: '%50\\%\\_Ada%',
      pageSize: 10,
      offset: 10,
    });
  });

  it('rejects unsafe aggregate counts', async () => {
    repository.findPage.mockResolvedValue({
      rows: [],
      total: '0',
      stats: {
        total: '9007199254740992', active: '0', paused: '0', completed: '0',
      },
    });
    await expect(service.list(4)).rejects.toThrow('Unsafe recurring invoice count');
  });
});
