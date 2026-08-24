import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type StoredOnboardingFeature = {
  seen?: unknown;
  timestamp?: unknown;
  version?: unknown;
  dismissed?: unknown;
  step_completed?: unknown;
};

export type OnboardingProgressDocument = Record<
  string,
  StoredOnboardingFeature
>;

type UserProgressRow = {
  onboarding_progress: unknown;
};

const asDocument = (value: unknown): OnboardingProgressDocument => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as OnboardingProgressDocument;
};

@Injectable()
export class OnboardingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findProgress(userId: number): Promise<OnboardingProgressDocument | null> {
    const result = await this.pool.query<UserProgressRow>(
      `SELECT onboarding_progress
       FROM users
       WHERE id = $1`,
      [userId],
    );
    return result.rows[0]
      ? asDocument(result.rows[0].onboarding_progress)
      : null;
  }

  markSeen(
    userId: number,
    featureKey: string,
    version: string,
    timestamp: string,
  ): Promise<OnboardingProgressDocument | null> {
    return this.mutate(userId, async (client, progress) => {
      progress[featureKey] = {
        seen: true,
        timestamp,
        version,
        dismissed: false,
      };
      await this.insertEvent(client, userId, featureKey, 'viewed', version, {
        timestamp,
      });
    });
  }

  dismiss(
    userId: number,
    featureKey: string,
  ): Promise<OnboardingProgressDocument | null> {
    return this.mutate(userId, async (client, progress) => {
      const current = progress[featureKey];
      progress[featureKey] = {
        ...(current && typeof current === 'object' ? current : { seen: true }),
        dismissed: true,
      };
      await this.insertEvent(client, userId, featureKey, 'dismissed');
    });
  }

  completeStep(
    userId: number,
    featureKey: string,
    step: number,
  ): Promise<OnboardingProgressDocument | null> {
    return this.mutate(userId, async (client, progress) => {
      const current = progress[featureKey];
      progress[featureKey] = {
        ...(current && typeof current === 'object' ? current : {}),
        step_completed: step,
      };
      await this.insertEvent(client, userId, featureKey, 'step_completed', undefined, {
        step,
      });
    });
  }

  reset(
    userId: number,
    featureKey?: string,
  ): Promise<OnboardingProgressDocument | null> {
    return this.mutate(userId, async (_client, progress) => {
      if (featureKey) delete progress[featureKey];
      else {
        for (const key of Object.keys(progress)) delete progress[key];
      }
    });
  }

  private async mutate(
    userId: number,
    operation: (
      client: PoolClient,
      progress: OnboardingProgressDocument,
    ) => Promise<void>,
  ): Promise<OnboardingProgressDocument | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<UserProgressRow>(
        `SELECT onboarding_progress
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      const progress = asDocument(result.rows[0].onboarding_progress);
      await operation(client, progress);
      await client.query(
        `UPDATE users
         SET onboarding_progress = $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(progress), userId],
      );
      await client.query('COMMIT');
      return progress;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertEvent(
    client: PoolClient,
    userId: number,
    featureKey: string,
    eventType: string,
    version?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO onboarding_events (
         user_id, feature_key, event_type, version, metadata
       ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, featureKey, eventType, version ?? '1.0', JSON.stringify(metadata)],
    );
  }
}
