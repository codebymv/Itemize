import { GraphQLError } from 'graphql';
import {
  ContactProfileRepository,
  ContactProfileRows,
} from './contact-profile.repository';
import { ContactProfileService } from './contact-profile.service';
import { ContactProfileSectionStatus } from './contact.enums';
import { ContactsService } from './contacts.service';

describe('ContactProfileService', () => {
  const contacts = {
    get: jest.fn(),
  } as unknown as jest.Mocked<ContactsService>;
  const profiles = {
    find: jest.fn(),
  } as unknown as jest.Mocked<ContactProfileRepository>;
  const service = new ContactProfileService(contacts, profiles);

  const contact = {
    id: 11,
    organizationId: 42,
    firstName: 'Ada',
  } as never;

  const emptyAvailable = { status: 'AVAILABLE' as const, rows: [] };
  const sectionNames = [
    'invoices',
    'signatures',
    'payments',
    'activities',
    'notes',
    'lists',
    'communications',
    'tasks',
    'bookings',
  ] as const;
  const emptyProfileRows = (): ContactProfileRows => ({
    invoices: emptyAvailable,
    signatures: emptyAvailable,
    payments: emptyAvailable,
    activities: emptyAvailable,
    notes: emptyAvailable,
    lists: emptyAvailable,
    communications: emptyAvailable,
    tasks: emptyAvailable,
    bookings: emptyAvailable,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    contacts.get.mockResolvedValue(contact);
  });

  it('maps bounded child rows and truncation metadata', async () => {
    profiles.find.mockResolvedValue({
      invoices: {
        status: 'AVAILABLE',
        rows: [
          {
            id: 7,
            invoice_number: 'INV-7',
            status: 'sent',
            total_amount: '19.50',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            due_date: '2026-01-15',
            total: 11,
          },
        ],
      },
      signatures: emptyAvailable,
      payments: emptyAvailable,
      activities: emptyAvailable,
      notes: emptyAvailable,
      lists: emptyAvailable,
      communications: emptyAvailable,
      tasks: emptyAvailable,
      bookings: emptyAvailable,
    });

    const result = await service.get(42, 11);

    expect(result.contact).toBe(contact);
    expect(result.invoices).toMatchObject({
      status: ContactProfileSectionStatus.AVAILABLE,
      total: 11,
      hasMore: true,
      nodes: [
        {
          id: 7,
          number: 'INV-7',
          total: 19.5,
        },
      ],
    });
    expect(profiles.find).toHaveBeenCalledWith(42, 11);
  });

  it.each(sectionNames)(
    'distinguishes an unavailable %s section from every genuine empty result',
    async (failedSection) => {
      const rows = emptyProfileRows();
      rows[failedSection] = { status: 'UNAVAILABLE', rows: [] };
      profiles.find.mockResolvedValue(rows);

      const result = await service.get(42, 11);

      expect(result[failedSection]).toEqual({
        status: ContactProfileSectionStatus.UNAVAILABLE,
        nodes: [],
        total: 0,
        hasMore: false,
      });
      for (const healthySection of sectionNames.filter(
        (section) => section !== failedSection,
      )) {
        expect(result[healthySection]).toEqual({
          status: ContactProfileSectionStatus.AVAILABLE,
          nodes: [],
          total: 0,
          hasMore: false,
        });
      }
    },
  );

  it('keeps parent contact misses tenant-private and skips child reads', async () => {
    contacts.get.mockRejectedValue(
      new GraphQLError('Contact not found', {
        extensions: { code: 'NOT_FOUND' },
      }),
    );

    await expect(service.get(42, 99)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
    expect(profiles.find).not.toHaveBeenCalled();
  });
});
