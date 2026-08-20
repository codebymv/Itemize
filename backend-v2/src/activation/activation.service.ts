import { Injectable, Logger } from '@nestjs/common';
import {
  ActivationArtifactType,
  ActivationRepository,
} from './activation.repository';

const SOURCES = new Set([
  'estimate_email_delivered',
  'invoice_email_delivered',
  'signature_request_delivered',
]);

@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(private readonly activation: ActivationRepository) {}

  /** Product telemetry must never fail the customer-facing delivery. */
  async recordArtifactSent(input: {
    organizationId: number;
    userId?: number | null;
    artifactType: ActivationArtifactType;
    artifactId: number;
    source: string;
  }): Promise<boolean> {
    if (
      !Number.isSafeInteger(input.organizationId) || input.organizationId < 1
      || !Number.isSafeInteger(input.artifactId) || input.artifactId < 1
      || !SOURCES.has(input.source)
    ) {
      this.logger.warn('Rejected invalid activation event', {
        organizationId: input.organizationId,
        artifactType: input.artifactType,
        source: input.source,
      });
      return false;
    }

    try {
      return await this.activation.insertArtifactSent({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        artifactType: input.artifactType,
        artifactId: input.artifactId,
        source: input.source,
        dedupeKey: `${input.organizationId}:artifact_sent:${input.artifactType}:${input.artifactId}`,
      });
    } catch (error) {
      this.logger.error('Failed to record activation event', {
        organizationId: input.organizationId,
        artifactType: input.artifactType,
        artifactId: input.artifactId,
        error,
      });
      return false;
    }
  }
}
