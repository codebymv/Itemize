import { ActivationRepository } from './activation.repository';
import { ActivationService } from './activation.service';

describe('ActivationService', () => {
  const repository = {
    insertArtifactSent: jest.fn(),
    insertArtifactAdvanced: jest.fn(),
    insertReturnAfterSend: jest.fn(),
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

  it('records server-observed advancement with a stage-specific identity', async () => {
    repository.insertArtifactAdvanced.mockResolvedValue(true);
    await expect(service.recordArtifactAdvanced({
      organizationId: 7,
      artifactType: 'signature',
      artifactId: 11,
      stage: 'signed',
      source: 'signature_recipient_signed',
    })).resolves.toBe(true);
    expect(repository.insertArtifactAdvanced).toHaveBeenCalledWith({
      organizationId: 7,
      userId: null,
      artifactType: 'signature',
      artifactId: 11,
      stage: 'signed',
      source: 'signature_recipient_signed',
      dedupeKey: '7:artifact_advanced:signature:11:signed',
    });
  });

  it('accepts recipient-owned estimate acceptance evidence', async () => {
    repository.insertArtifactAdvanced.mockResolvedValue(true);
    await expect(service.recordArtifactAdvanced({
      organizationId: 7,
      artifactType: 'estimate',
      artifactId: 12,
      stage: 'accepted',
      source: 'estimate_recipient_accepted',
    })).resolves.toBe(true);
    expect(repository.insertArtifactAdvanced).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: 'estimate',
        artifactId: 12,
        stage: 'accepted',
      }),
    );
  });

  it('rejects mismatched advancement evidence', async () => {
    await expect(service.recordArtifactAdvanced({
      organizationId: 7,
      artifactType: 'invoice',
      artifactId: 11,
      stage: 'viewed',
      source: 'invoice_payment_succeeded',
    })).resolves.toBe(false);
    expect(repository.insertArtifactAdvanced).not.toHaveBeenCalled();
  });

  it('records one conservative authenticated return identity', async () => {
    repository.insertReturnAfterSend.mockResolvedValue(true);
    await expect(service.recordReturnAfterSend({
      organizationId: 7,
      userId: 9,
    })).resolves.toBe(true);
    expect(repository.insertReturnAfterSend).toHaveBeenCalledWith({
      organizationId: 7,
      userId: 9,
      source: 'dashboard_analytics_authenticated',
      dedupeKey: '7:returned_after_send',
    });
  });
});
