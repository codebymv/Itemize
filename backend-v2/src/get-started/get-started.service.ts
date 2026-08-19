import { Injectable, Logger } from '@nestjs/common';
import {
  GET_STARTED_MILESTONES,
  GET_STARTED_SOURCES,
  GET_STARTED_STEPS,
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
    const [rows, counts, dismissed] = await Promise.all([
      this.getStarted.findMilestones(organizationId),
      this.getStarted.liveCounts(organizationId),
      this.getStarted.isDismissed(organizationId, userId),
    ]);

    const completed = new Map<string, Date>(
      rows.map((row) => [row.name, row.occurred_at]),
    );

    await Promise.all([
      this.ensure(organizationId, completed, 'first_contact', counts.contacts > 0),
      this.ensure(organizationId, completed, 'first_list', counts.lists > 0),
      this.ensure(organizationId, completed, 'first_invoice', counts.invoices > 0),
      this.ensure(organizationId, completed, 'first_deal', counts.deals > 0),
    ]);

    const steps: GetStartedStep[] = GET_STARTED_STEPS.map((step) => {
      if (step.id === 'workspace_ready') {
        return {
          id: step.id,
          completed: true,
          completedAt: null,
          href: step.href,
        };
      }
      if (step.id === 'first_money') {
        const completedAt =
          completed.get('first_invoice') ?? completed.get('first_deal') ?? null;
        return {
          id: step.id,
          completed: completedAt != null,
          completedAt,
          href: step.href,
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
