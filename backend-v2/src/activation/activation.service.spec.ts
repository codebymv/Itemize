import { ActivationRepository } from './activation.repository';
import { ActivationService } from './activation.service';

describe('ActivationService', () => {
  const repository = {
    insertArtifactSent: jest.fn(),
  } as unknown as jest.Mocked<ActivationRepository>;
  const service = new ActivationService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('records one PII-free artifact send identity', async () => {
    repository.insertArtifactSent.mockResolvedValue(true);
    await expect(service.recordArtifactSent({
      organizationId: 7,
      userId: 9,
      artifactType: 'invoice',
      artifactId: 11,
      source: 'invoice_email_delivered',
    })).resolves.toBe(true);
    expect(repository.insertArtifactSent).toHaveBeenCalledWith({
      organizationId: 7,
      userId: 9,
      artifactType: 'invoice',
      artifactId: 11,
      source: 'invoice_email_delivered',
      dedupeKey: '7:artifact_sent:invoice:11',
    });
  });

  it('never fails delivery when telemetry persistence fails', async () => {
    repository.insertArtifactSent.mockRejectedValue(new Error('database unavailable'));
    await expect(service.recordArtifactSent({
      organizationId: 7,
      artifactType: 'signature',
      artifactId: 11,
      source: 'signature_request_delivered',
    })).resolves.toBe(false);
  });

  it('rejects unknown sources without writing', async () => {
    await expect(service.recordArtifactSent({
      organizationId: 7,
      artifactType: 'estimate',
      artifactId: 11,
      source: 'browser_supplied',
    })).resolves.toBe(false);
    expect(repository.insertArtifactSent).not.toHaveBeenCalled();
  });
});
