import { Injectable, Logger } from '@nestjs/common';
import {
  ActivationArtifactStage,
  ActivationArtifactType,
  ActivationRepository,
} from './activation.repository';

const SOURCES = new Set([
  'estimate_email_delivered',
  'invoice_email_delivered',
  'signature_request_delivered',
]);

const ADVANCEMENT_SOURCES: Record<string, {
  artifactType: ActivationArtifactType;
  stage: ActivationArtifactStage;
}> = {
  estimate_recipient_accepted: { artifactType: 'estimate', stage: 'accepted' },
  estimate_recipient_viewed: { artifactType: 'estimate', stage: 'viewed' },
  invoice_payment_succeeded: { artifactType: 'invoice', stage: 'paid' },
  signature_recipient_signed: { artifactType: 'signature', stage: 'signed' },
  signature_recipient_viewed: { artifactType: 'signature', stage: 'viewed' },
};

const RETURN_SOURCE = 'dashboard_analytics_authenticated';

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

  /** Records only server-observed recipient or payment state transitions. */
  async recordArtifactAdvanced(input: {
    organizationId: number;
    artifactType: ActivationArtifactType;
    artifactId: number;
    stage: ActivationArtifactStage;
    source: string;
  }): Promise<boolean> {
    const expected = ADVANCEMENT_SOURCES[input.source];
    if (
      !Number.isSafeInteger(input.organizationId) || input.organizationId < 1
      || !Number.isSafeInteger(input.artifactId) || input.artifactId < 1
      || expected?.artifactType !== input.artifactType
      || expected.stage !== input.stage
    ) {
      this.logger.warn('Rejected invalid activation advancement', {
        organizationId: input.organizationId,
        artifactType: input.artifactType,
        stage: input.stage,
        source: input.source,
      });
      return false;
    }

    try {
      return await this.activation.insertArtifactAdvanced({
        ...input,
        userId: null,
        dedupeKey:
          `${input.organizationId}:artifact_advanced:${input.artifactType}`
          + `:${input.artifactId}:${input.stage}`,
      });
    } catch (error) {
      this.logger.error('Failed to record activation advancement', {
        organizationId: input.organizationId,
        artifactType: input.artifactType,
        artifactId: input.artifactId,
        stage: input.stage,
        error,
      });
      return false;
    }
  }

  /** A return is conservative: the first authenticated dashboard load 24h after send. */
  async recordReturnAfterSend(input: {
    organizationId: number;
    userId: number;
  }): Promise<boolean> {
    if (
      !Number.isSafeInteger(input.organizationId) || input.organizationId < 1
      || !Number.isSafeInteger(input.userId) || input.userId < 1
    ) return false;

    try {
      return await this.activation.insertReturnAfterSend({
        ...input,
        source: RETURN_SOURCE,
        dedupeKey: `${input.organizationId}:returned_after_send`,
      });
    } catch (error) {
      this.logger.error('Failed to record return after send', {
        organizationId: input.organizationId,
        userId: input.userId,
        error,
      });
      return false;
    }
  }
}
