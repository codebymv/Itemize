import { ActivationService } from '../activation/activation.service';
import {
  EstimatePublicRepository,
  PublicEstimateCapability,
} from './estimate-public.repository';
import { EstimatePublicService } from './estimate-public.service';

describe('EstimatePublicService', () => {
  const repository = {
    open: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
  } as unknown as jest.Mocked<EstimatePublicRepository>;
  const activation = {
    recordArtifactAdvanced: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<ActivationService>;
  const service = new EstimatePublicService(repository, activation);
  const token = 'a'.repeat(43);
  const capability: PublicEstimateCapability = {
    capability_id: 19,
    delivery_id: 23,
    organization_id: 3,
    estimate_id: 7,
    estimate_created_by: 5,
    requested_by_user_id: 5,
    estimate_number: 'EST-00007',
    organization_name: 'Studio workspace',
    status: 'sent',
    sent_at: new Date('2026-08-20T10:00:00Z'),
    viewed_at: new Date('2026-08-20T10:05:00Z'),
    accepted_at: null,
    declined_at: null,
    expires_at: new Date('2026-09-20T00:00:00Z'),
    payload: {
      subject: 'Estimate EST-00007',
      estimateNumber: 'EST-00007',
      customerName: 'Customer',
      issueDate: '2026-08-20',
      validUntil: '2026-09-19',
      subtotal: '100.00',
      taxAmount: '8.00',
      discountAmount: '0.00',
      total: '108.00',
      currency: 'USD',
      businessName: 'Studio',
      businessEmail: 'hello@studio.test',
      notes: 'Thank you',
      termsAndConditions: 'Net 30',
      items: [{
        name: 'Design', description: null, quantity: '2.00', unitPrice: '50.00',
        taxRate: '8.00', taxAmount: '8.00', total: '108.00',
      }],
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns a tenant-locator-free delivery snapshot and records first view', async () => {
    repository.open.mockResolvedValue(capability);
    const result = await service.open(token);
    expect(result).toMatchObject({
      estimate: { number: 'EST-00007', status: 'sent', total: '108.00' },
      customer: { name: 'Customer' },
      business: { name: 'Studio' },
      items: [{ name: 'Design', unit_price: '50.00' }],
    });
    expect(JSON.stringify(result)).not.toContain('organization_id');
    expect(JSON.stringify(result)).not.toContain('estimate_id');
    expect(activation.recordArtifactAdvanced).toHaveBeenCalledWith({
      organizationId: 3,
      artifactType: 'estimate',
      artifactId: 7,
      stage: 'viewed',
      source: 'estimate_recipient_viewed',
    });
  });

  it('uses a product-native workspace fallback instead of placeholder company copy', async () => {
    repository.open.mockResolvedValue({
      ...capability,
      payload: { ...capability.payload, businessName: null },
    });

    await expect(service.open(token)).resolves.toMatchObject({
      business: { name: 'Studio workspace' },
    });
  });

  it('repairs legacy placeholder business names with the organization identity', async () => {
    repository.open.mockResolvedValue({
      ...capability,
      payload: { ...capability.payload, businessName: 'Our Company' },
    });

    await expect(service.open(token)).resolves.toMatchObject({
      business: { name: 'Studio workspace' },
    });
  });

  it('records explicit recipient acceptance and tolerates idempotent replay', async () => {
    const accepted = { ...capability, status: 'accepted' as const, accepted_at: new Date() };
    repository.accept.mockResolvedValue({ kind: 'replayed', capability: accepted });
    await expect(service.accept(token)).resolves.toMatchObject({
      estimate: { status: 'accepted' },
    });
    expect(activation.recordArtifactAdvanced).toHaveBeenCalledWith({
      organizationId: 3,
      artifactType: 'estimate',
      artifactId: 7,
      stage: 'accepted',
      source: 'estimate_recipient_accepted',
    });
  });

  it('uses the same non-enumerating miss for malformed and unknown tokens', async () => {
    repository.open.mockResolvedValue(null);
    await expect(service.open('bad')).rejects.toMatchObject({ status: 404 });
    await expect(service.open(token)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects the opposite terminal response without overwriting it', async () => {
    repository.decline.mockResolvedValue({ kind: 'conflict', status: 'accepted' });
    await expect(service.decline(token)).rejects.toMatchObject({ status: 409 });
  });
});
