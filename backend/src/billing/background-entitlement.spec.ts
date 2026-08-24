import { Pool } from 'pg';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { CampaignSendRepository } from '../campaign-delivery/campaign-send.repository';
import { EstimatesRepository } from '../estimates/estimates.repository';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { SignatureDeliveryJobsRepository } from '../signature-delivery/signature-delivery-jobs.repository';
import { WorkflowEnrollmentJobsRepository } from '../workflow-jobs/workflow-enrollment-jobs.repository';
import { WorkflowSideEffectJobsRepository } from '../workflow-jobs/workflow-side-effect-jobs.repository';
import { WorkflowTriggerJobsRepository } from '../workflow-jobs/workflow-trigger-jobs.repository';

const expectPaidPredicate = (sql: string): void => {
  expect(sql).toContain("organization.plan IN ('starter','unlimited','pro')");
  expect(sql).toContain("organization.subscription_status='active'");
  expect(sql).toContain('organization.trial_ends_at>CURRENT_TIMESTAMP');
};

describe('background worker paid-entitlement boundaries', () => {
  it('gates campaign and document delivery at both discovery and claim', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    const campaign = new CampaignSendRepository(
      pool,
      {} as CampaignsRepository,
    );
    await campaign.due(10);
    await campaign.claim(4, 8);

    const invoices = new InvoicesRepository(pool);
    await invoices.dueEmailDeliveryIds(10);
    await invoices.claimEmailDelivery(4, 8);

    const estimates = new EstimatesRepository(pool);
    await estimates.dueEmailDeliveryIds(10);
    await estimates.claimEmailDelivery(4, 8);

    for (const [sql] of query.mock.calls) expectPaidPredicate(String(sql));
  });

  it('gates every workflow claim phase and only new signature work', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = {
      query,
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      query,
    } as unknown as Pool;

    await new WorkflowTriggerJobsRepository(pool).claimTrigger(30);
    await new WorkflowEnrollmentJobsRepository(pool).claimEnrollment(30);
    await new WorkflowSideEffectJobsRepository(pool).claim(30);
    await new SignatureDeliveryJobsRepository(pool).claim(30);

    const workerSql = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("organization.plan IN ('starter','unlimited','pro')"));
    expect(workerSql).toHaveLength(4);
    workerSql.forEach(expectPaidPredicate);
    expect(workerSql.find((sql) => sql.includes('signature_delivery_outbox')))
      .toContain("delivery_type NOT IN ('signature_request','signature_reminder')");
  });
});
