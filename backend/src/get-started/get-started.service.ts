import { Injectable, Logger } from '@nestjs/common';
import {
  BUSINESS_GET_STARTED_STEPS,
  FREE_GET_STARTED_STEPS,
  GET_STARTED_MILESTONES,
  GET_STARTED_SOURCES,
  GetStartedMilestoneName,
  GetStartedSource,
} from './get-started.constants';
import { GetStartedRepository } from './get-started.repository';
import { GetStartedProgress, GetStartedStep } from './get-started.types';

const MILESTONE_NAMES = new Set<string>(GET_STARTED_MILESTONES);
const SOURCES = new Set<string>(GET_STARTED_SOURCES);
const FORBIDDEN_PROPERTY_KEY =
  /(email|phone|token|secret|password|credential|name|body|address)/i;
const ALLOWED_PROPERTY_KEY = /^[a-zA-Z]+Id$/;

export type RecordGetStartedInput = {
  organizationId: number;
  userId?: number | null;
  name: GetStartedMilestoneName;
  source: GetStartedSource;
  properties?: Record<string, unknown>;
};

@Injectable()
export class GetStartedService {
  private readonly logger = new Logger(GetStartedService.name);

  constructor(private readonly getStarted: GetStartedRepository) {}

  async record(input: RecordGetStartedInput): Promise<boolean> {
    if (!MILESTONE_NAMES.has(input.name) || !SOURCES.has(input.source)) {
      this.logger.warn('Rejected unknown get started milestone', {
        name: input.name,
        source: input.source,
      });
      return false;
    }

    try {
      await this.getStarted.insertMilestone({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        name: input.name,
        source: input.source,
        dedupeKey: `${input.organizationId}:${input.name}:first`,
        properties: this.sanitize(input.properties),
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to record get started milestone', {
        name: input.name,
        organizationId: input.organizationId,
        error,
      });
      return false;
    }
  }

  async progress(
    organizationId: number,
    userId: number,
  ): Promise<GetStartedProgress> {
    const [rows, live, dismissed] = await Promise.all([
      this.getStarted.findMilestones(organizationId),
      this.getStarted.liveState(organizationId),
      this.getStarted.isDismissed(organizationId, userId),
    ]);

    const completed = new Map<string, Date>(
      rows.map((row) => [row.name, row.occurred_at]),
    );

    // Preserve completion for organizations that finished the original,
    // list-only workspace step before it was broadened to any Canvas item.
    const legacyFirstListAt = completed.get('first_list');
    if (legacyFirstListAt && !completed.has('first_workspace_item')) {
      completed.set('first_workspace_item', legacyFirstListAt);
    }

    await Promise.all([
      this.ensure(organizationId, completed, 'first_contact', live.contacts > 0),
      this.ensure(
        organizationId,
        completed,
        'first_workspace_item',
        live.workspaceItems > 0,
      ),
    ]);

    const businessJourney = live.plan != null && live.plan !== 'free';
    const definitions = businessJourney
      ? BUSINESS_GET_STARTED_STEPS
      : FREE_GET_STARTED_STEPS;
    const firstArtifactHref = {
      estimate: '/estimates',
      invoice: '/invoices',
      signature: '/documents',
    }[live.first_artifact_type ?? 'estimate'];

    const steps: GetStartedStep[] = definitions.map((step) => {
      if (step.id === 'first_artifact') {
        return {
          id: step.id,
          completed: live.first_artifact_at != null,
          completedAt: live.first_artifact_at,
          href: step.href,
        };
      }
      if (step.id === 'first_send') {
        return {
          id: step.id,
          completed: live.artifact_sent_at != null,
          completedAt: live.artifact_sent_at,
          href: firstArtifactHref,
        };
      }
      return {
        id: step.id,
        completed: completed.has(step.id),
        completedAt: completed.get(step.id) ?? null,
        href: step.href,
      };
    });

    return {
      dismissed,
      completedCount: steps.filter((step) => step.completed).length,
      totalCount: steps.length,
      steps,
    };
  }

  async dismiss(
    organizationId: number,
    userId: number,
  ): Promise<GetStartedProgress> {
    await this.getStarted.dismiss(organizationId, userId);
    return this.progress(organizationId, userId);
  }

  private async ensure(
    organizationId: number,
    completed: Map<string, Date>,
    name: GetStartedMilestoneName,
    live: boolean,
  ): Promise<void> {
    if (completed.has(name) || !live) return;
    await this.record({
      organizationId,
      name,
      source: 'live_backfill',
    });
    completed.set(name, new Date());
  }

  private sanitize(properties?: Record<string, unknown>): Record<string, unknown> {
    if (!properties) return {};
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties).slice(0, 20)) {
      if (FORBIDDEN_PROPERTY_KEY.test(key) || !ALLOWED_PROPERTY_KEY.test(key)) {
        continue;
      }
      if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
        safe[key] = value;
      }
    }
    return safe;
  }
}
