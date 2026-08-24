import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/database.module';
import {
  TRIAL_REMINDER_EMAIL_PROVIDER,
  TrialReminderEmail,
  TrialReminderSendResult,
  TrialRemindersService,
} from '../../src/trial-reminders/trial-reminders.service';

describe('Trial reminder job (NestJS owner; legacy job is dead code)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let service: TrialRemindersService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  const sent: TrialReminderEmail[] = [];
  const provider = {
    send: jest.fn<Promise<TrialReminderSendResult>, [TrialReminderEmail]>(
      async (message: TrialReminderEmail) => {
        sent.push(message);
        return { kind: 'sent', providerId: 'prov_trial' };
      },
    ),
  };

  const seedTrialOrganization = async (label: string, daysOut: number) => {
    const user = await dbHelper.seedUser(
      `trial-${label}-${Date.now()}-${Math.random()}@test.itemize`,
      `Trial ${label}`,
    );
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + daysOut);
    endsAt.setHours(12, 0, 0, 0);
    await pool.query(
      `UPDATE organizations SET
         subscription_status = 'trialing', trial_ends_at = $2, plan = 'starter',
         name = $3
       WHERE id = $1`,
      [user.org.id, endsAt, `Trial ${label}`],
    );
    return { user, endsAt };
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for trial reminder tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://app.parity.test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(TRIAL_REMINDER_EMAIL_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
    service = app.get(TrialRemindersService);

    // The seedUser trial grant would otherwise flood the 3-day window
    // as other suites' organizations age; pin every preexisting org out
    // of the window so this suite's fixtures are the only candidates.
    await pool.query(
      `UPDATE organizations SET trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
       WHERE subscription_status = 'trialing'`,
    );
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it('documents that the legacy cron is inert: it finds nothing even with an eligible trial', async () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const legacyCron = require('../../../backend/src/jobs/trialReminderCron');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const { user } = await seedTrialOrganization('legacy-dead', 3);
    // The legacy finder requires backend/src/db as a pool, which exports
    // helpers instead; its query crashes into the catch and returns [].
    await expect(legacyCron.sendTrialReminders()).resolves.toBeUndefined();
    const logs = await pool.query(
      `SELECT 1 FROM email_logs
       WHERE organization_id = $1 AND metadata->>'email_type' = 'trial_reminder'`,
      [user.org.id],
    );
    expect(logs.rows).toHaveLength(0);
    // Reset for the NestJS selection tests below.
    await pool.query(
      `UPDATE organizations SET trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
       WHERE id = $1`,
      [user.org.id],
    );
  });

  it('selects only trials ending in exactly three days and sends the branded reminder', async () => {
    const eligible = await seedTrialOrganization('eligible', 3);
    await seedTrialOrganization('too-soon', 1);
    await seedTrialOrganization('too-late', 10);

    const summary = await service.sendTrialReminders();
    expect(summary).toEqual({ found: 1, sent: 1, failed: 0 });
    const message = sent[sent.length - 1];
    expect(message.to).toBe(eligible.user.user.email);
    expect(message.subject).toBe('Your Itemize trial ends in 3 days');
    expect(message.idempotencyKey).toContain(
      `trial-reminder:${eligible.user.org.id}:`,
    );
    expect(message.html).toContain('Your trial is ending soon');
    expect(message.html).toContain('Trial eligible');
    expect(message.html).toContain('ends in <strong>3 days</strong>');
    expect(message.html).toContain(
      'https://app.parity.test/settings?tab=billing',
    );

    const log = await pool.query<{ to_email: string; subject: string }>(
      `SELECT to_email, subject FROM email_logs
       WHERE organization_id = $1 AND metadata->>'email_type' = 'trial_reminder'`,
      [eligible.user.org.id],
    );
    expect(log.rows).toEqual([
      {
        to_email: eligible.user.user.email,
        subject: 'Trial Email: trial_reminder',
      },
    ]);
  });

  it('never sends the reminder twice to the same organization', async () => {
    const before = sent.length;
    const summary = await service.sendTrialReminders();
    expect(summary.sent).toBe(0);
    expect(sent.length).toBe(before);
  });

  it('allows only one provider call when two workers race for the same reminder', async () => {
    const eligible = await seedTrialOrganization('concurrent', 3);
    const before = provider.send.mock.calls.length;

    const outcomes = await Promise.all([
      service.sendTrialReminders(),
      service.sendTrialReminders(),
    ]);

    expect(
      provider.send.mock.calls.length - before,
    ).toBe(1);
    expect(outcomes.reduce((total, outcome) => total + outcome.sent, 0)).toBe(1);
    const logs = await pool.query(
      `SELECT 1 FROM email_logs
       WHERE organization_id = $1 AND metadata->>'email_type' = 'trial_reminder'`,
      [eligible.user.org.id],
    );
    expect(logs.rows).toHaveLength(1);
  });

  it('counts provider failures without writing the dedupe log', async () => {
    const { user } = await seedTrialOrganization('failing', 3);
    provider.send.mockResolvedValueOnce({
      kind: 'rejected',
      error: 'provider down',
      retryable: true,
    });
    const summary = await service.sendTrialReminders();
    expect(summary).toEqual({ found: 1, sent: 0, failed: 1 });
    const logs = await pool.query(
      `SELECT 1 FROM email_logs
       WHERE organization_id = $1 AND metadata->>'email_type' = 'trial_reminder'`,
      [user.org.id],
    );
    expect(logs.rows).toHaveLength(0);

    // The failed organization is retried on the next daily run.
    await pool.query(
      `UPDATE trial_reminder_deliveries
       SET next_attempt_at = CURRENT_TIMESTAMP
       WHERE organization_id = $1`,
      [user.org.id],
    );
    const retry = await service.sendTrialReminders();
    expect(retry).toEqual({ found: 1, sent: 1, failed: 0 });
  });

  it('reuses the provider idempotency key after an ambiguous failure', async () => {
    const { user } = await seedTrialOrganization('ambiguous', 3);
    provider.send.mockRejectedValueOnce(new Error('provider timeout'));

    const failed = await service.sendTrialReminders();
    expect(failed).toEqual({ found: 1, sent: 0, failed: 1 });
    const firstMessage = provider.send.mock.calls.at(-1)?.[0];

    await pool.query(
      `UPDATE trial_reminder_deliveries
       SET next_attempt_at = CURRENT_TIMESTAMP
       WHERE organization_id = $1`,
      [user.org.id],
    );
    const retried = await service.sendTrialReminders();
    expect(retried).toEqual({ found: 1, sent: 1, failed: 0 });
    const secondMessage = provider.send.mock.calls.at(-1)?.[0];
    expect(firstMessage).toBeDefined();
    expect(secondMessage).toBeDefined();
    expect(secondMessage!.idempotencyKey).toBe(firstMessage!.idempotencyKey);

    const logs = await pool.query(
      `SELECT 1 FROM email_logs
       WHERE organization_id = $1 AND metadata->>'email_type' = 'trial_reminder'`,
      [user.org.id],
    );
    expect(logs.rows).toHaveLength(1);
  });
});
