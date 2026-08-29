const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED = 'automations-ui-20260828';
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

const samples = [
  {
    name: 'New Lead Welcome',
    description: 'Qualify new contacts, tag them for follow-up, and create an owner task.',
    triggerType: 'contact_added',
    triggerConfig: {},
    isActive: true,
    updatedDaysAgo: 1,
    steps: [
      { type: 'add_tag', config: { tag_name: 'New lead' } },
      { type: 'wait', config: { delay_days: 1, delay_hours: 0, delay_minutes: 0 } },
      { type: 'create_task', config: { title: 'Review new lead', description: 'Confirm fit and choose the next sales action.', due_days: 2 } },
    ],
    runs: [
      { status: 'active', currentStep: 2, enrolledDaysAgo: 1, nextDaysFromNow: 4 },
      { status: 'completed', currentStep: 3, enrolledDaysAgo: 12, completedDaysAgo: 8 },
      { status: 'failed', currentStep: 3, enrolledDaysAgo: 7, error: 'Task owner is no longer available.' },
    ],
  },
  {
    name: 'Proposal Follow-up',
    description: 'Route submitted proposals by company profile and prepare the right follow-up.',
    triggerType: 'form_submitted',
    triggerConfig: { form_name: 'Project inquiry' },
    isActive: true,
    updatedDaysAgo: 2,
    steps: [
      {
        type: 'condition',
        config: {},
        condition: { field: 'company', operator: 'is_not_empty', value: '' },
        trueBranchStep: 2,
        falseBranchStep: 4,
      },
      { type: 'add_tag', config: { tag_name: 'Company lead' } },
      { type: 'create_task', config: { title: 'Prepare proposal follow-up', description: 'Review scope and send the recommended next step.', due_days: 1 } },
      { type: 'add_tag', config: { tag_name: 'Needs qualification' } },
    ],
    runs: [
      { status: 'active', currentStep: 3, enrolledDaysAgo: 2, nextDaysFromNow: 6 },
      { status: 'completed', currentStep: 4, enrolledDaysAgo: 9, completedDaysAgo: 7 },
      { status: 'paused', currentStep: 2, enrolledDaysAgo: 5, pausedDaysAgo: 1 },
    ],
  },
  {
    name: 'Payment Thank-you',
    description: 'Mark paid customers, update their contact status, and queue the account handoff.',
    triggerType: 'invoice_paid',
    triggerConfig: {},
    isActive: true,
    updatedDaysAgo: 3,
    steps: [
      { type: 'add_tag', config: { tag_name: 'Paid customer' } },
      { type: 'update_contact', config: { status: 'customer' } },
      { type: 'create_task', config: { title: 'Confirm payment handoff', description: 'Make sure fulfillment has everything needed to begin.', due_days: 1 } },
    ],
    runs: [
      { status: 'completed', currentStep: 3, enrolledDaysAgo: 4, completedDaysAgo: 3 },
      { status: 'completed', currentStep: 3, enrolledDaysAgo: 11, completedDaysAgo: 10 },
      { status: 'completed', currentStep: 3, enrolledDaysAgo: 18, completedDaysAgo: 17 },
    ],
  },
  {
    name: 'VIP Customer Nurture',
    description: 'A parked nurture sequence for contacts who receive the VIP tag.',
    triggerType: 'tag_added',
    triggerConfig: { tag_name: 'VIP' },
    isActive: false,
    updatedDaysAgo: 7,
    steps: [
      { type: 'wait', config: { delay_days: 7, delay_hours: 0, delay_minutes: 0 } },
      { type: 'create_task', config: { title: 'Plan VIP check-in', description: 'Review the relationship and choose a personal touchpoint.', due_days: 2 } },
      { type: 'add_tag', config: { tag_name: 'VIP nurture started' } },
    ],
    runs: [
      { status: 'paused', currentStep: 2, enrolledDaysAgo: 14, pausedDaysAgo: 7, pauseReason: 'workflow_deactivated' },
      { status: 'cancelled', currentStep: 1, enrolledDaysAgo: 22, completedDaysAgo: 15 },
    ],
  },
  {
    name: 'Weekly Account Check-in',
    description: 'A scheduled account-review workflow kept inactive until the team is ready.',
    triggerType: 'scheduled',
    triggerConfig: { frequency: 'weekly' },
    isActive: false,
    updatedDaysAgo: 9,
    scheduled: true,
    steps: [
      { type: 'create_task', config: { title: 'Review account health', description: 'Check activity, open work, and upcoming commitments.', due_days: 1 } },
      { type: 'wait', config: { delay_hours: 4, delay_days: 0, delay_minutes: 0 } },
      { type: 'add_tag', config: { tag_name: 'Account reviewed' } },
    ],
    runs: [],
  },
  {
    name: 'Signed Contract Onboarding',
    description: 'Start delivery preparation as soon as a contract is signed.',
    triggerType: 'contract_signed',
    triggerConfig: {},
    isActive: true,
    updatedDaysAgo: 4,
    steps: [
      { type: 'add_tag', config: { tag_name: 'Onboarding' } },
      { type: 'update_contact', config: { status: 'customer' } },
      { type: 'create_task', config: { title: 'Schedule kickoff', description: 'Confirm the internal owner and offer kickoff times.', due_days: 2 } },
      { type: 'wait', config: { delay_days: 2, delay_hours: 0, delay_minutes: 0 } },
    ],
    runs: [
      { status: 'active', currentStep: 4, enrolledDaysAgo: 1, nextDaysFromNow: 3 },
      { status: 'completed', currentStep: 4, enrolledDaysAgo: 16, completedDaysAgo: 12 },
      { status: 'failed', currentStep: 3, enrolledDaysAgo: 6, error: 'No task owner could be resolved.' },
    ],
  },
];

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT
       users.id AS user_id,
       users.email,
       organizations.id AS organization_id,
       organizations.name AS organization_name,
       organizations.plan,
       organizations.workflows_limit
     FROM users
     JOIN organization_members membership ON membership.user_id = users.id
     JOIN organizations ON organizations.id = membership.organization_id
     WHERE lower(users.email) = lower($1)
     ORDER BY
       (organizations.id = users.default_organization_id) DESC,
       membership.joined_at,
       organizations.id
     LIMIT 1`,
    [OWNER_EMAIL],
  );
  if (!result.rows[0]) throw new Error(`No organization membership found for ${OWNER_EMAIL}`);
  return result.rows[0];
}

async function getContacts(client, organizationId) {
  const result = await client.query(
    `SELECT id, first_name, last_name, email
     FROM contacts
     WHERE organization_id = $1
     ORDER BY created_at, id
     LIMIT 12`,
    [organizationId],
  );
  return result.rows;
}

async function listSamples(client, organizationId) {
  const result = await client.query(
    `SELECT w.id, w.name, w.trigger_type, w.is_active,
       COUNT(we.id)::int AS run_count,
       COUNT(we.id) FILTER (WHERE we.status = 'active')::int AS running_count,
       COUNT(we.id) FILTER (WHERE we.status = 'completed')::int AS completed_count,
       COUNT(we.id) FILTER (WHERE we.status = 'failed')::int AS failed_count
     FROM workflows w
     LEFT JOIN workflow_enrollments we ON we.workflow_id = w.id
     WHERE w.organization_id = $1
       AND w.trigger_config @> $2::jsonb
     GROUP BY w.id
     ORDER BY w.updated_at DESC, w.id DESC`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  return result.rows;
}

async function removeSamples(client, organizationId) {
  const result = await client.query(
    `DELETE FROM workflows
     WHERE organization_id = $1 AND trigger_config @> $2::jsonb
     RETURNING id`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  return result.rowCount || 0;
}

function statsFor(runs) {
  return runs.reduce((stats, run) => {
    stats.enrolled += 1;
    if (run.status === 'completed') stats.completed += 1;
    if (run.status === 'failed') stats.failed += 1;
    return stats;
  }, { enrolled: 0, completed: 0, failed: 0 });
}

async function seed(client, target, contacts) {
  if (contacts.length < 3) {
    throw new Error(`At least 3 contacts are required to seed useful run history; found ${contacts.length}`);
  }

  await client.query('BEGIN');
  try {
    await removeSamples(client, target.organization_id);

    for (const sample of samples) {
      const markerConfig = { ...sample.triggerConfig, sample: true, seed: SEED };
      const scheduledContactId = sample.scheduled ? Number(contacts[0].id) : null;
      if (sample.scheduled) {
        markerConfig.contact_id = scheduledContactId;
        markerConfig.scheduled_at = daysFromNow(7).toISOString();
      }
      const createdAt = daysAgo(sample.updatedDaysAgo + 14);
      const updatedAt = daysAgo(sample.updatedDaysAgo);
      const workflow = await client.query(
        `INSERT INTO workflows (
           organization_id, name, description, trigger_type, trigger_config,
           scheduled_contact_id, next_trigger_at, is_active, stats,
           created_by, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb,
           $6, $7, $8, $9::jsonb,
           $10, $11, $12
         ) RETURNING id`,
        [
          target.organization_id,
          sample.name,
          sample.description,
          sample.triggerType,
          JSON.stringify(markerConfig),
          scheduledContactId,
          sample.scheduled ? daysFromNow(7) : null,
          sample.isActive,
          JSON.stringify(statsFor(sample.runs)),
          target.user_id,
          createdAt,
          updatedAt,
        ],
      );
      const workflowId = Number(workflow.rows[0].id);

      for (const [index, step] of sample.steps.entries()) {
        await client.query(
          `INSERT INTO workflow_steps (
             workflow_id, step_order, step_type, step_config, condition_config,
             true_branch_step, false_branch_step, created_at, updated_at
           ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
          [
            workflowId,
            index + 1,
            step.type,
            JSON.stringify(step.config),
            step.condition ? JSON.stringify(step.condition) : null,
            step.trueBranchStep || null,
            step.falseBranchStep || null,
            createdAt,
            updatedAt,
          ],
        );
      }

      for (const [index, run] of sample.runs.entries()) {
        const contact = contacts[index % contacts.length];
        const enrolledAt = daysAgo(run.enrolledDaysAgo);
        const completedAt = run.completedDaysAgo === undefined ? null : daysAgo(run.completedDaysAgo);
        const pausedAt = run.pausedDaysAgo === undefined ? null : daysAgo(run.pausedDaysAgo);
        await client.query(
          `INSERT INTO workflow_enrollments (
             workflow_id, contact_id, current_step, status, trigger_data, context,
             error_message, enrolled_at, next_action_at, completed_at,
             execution_attempt_count, pause_reason, paused_at
           ) VALUES (
             $1, $2, $3, $4, $5::jsonb, $6::jsonb,
             $7, $8, $9, $10,
             $11, $12, $13
           )`,
          [
            workflowId,
            Number(contact.id),
            run.currentStep,
            run.status,
            JSON.stringify({ source: 'sample-seed', seed: SEED }),
            JSON.stringify({ sample: true, path: index % 2 === 0 ? 'primary' : 'alternate' }),
            run.error || null,
            enrolledAt,
            run.nextDaysFromNow === undefined ? null : daysFromNow(run.nextDaysFromNow),
            completedAt,
            run.status === 'failed' ? 3 : 0,
            run.status === 'paused' ? (run.pauseReason || 'manual') : null,
            pausedAt,
          ],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if ([DRY_RUN, APPLY, CLEANUP].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }
  if (!OWNER_EMAIL) throw new Error('SEED_OWNER_EMAIL is required');
  const connectionString = process.env.SEED_DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('A database connection URL is required');

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const target = await resolveTarget(client);
    const contacts = await getContacts(client, target.organization_id);
    const existing = await listSamples(client, target.organization_id);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
        plan: target.plan,
        workflowLimit: Number(target.workflows_limit),
      },
      availableContacts: contacts.length,
      existingSampleAutomations: existing.length,
      plannedSampleAutomations: APPLY || DRY_RUN ? samples.length : 0,
      plannedSampleRuns: APPLY || DRY_RUN
        ? samples.reduce((total, sample) => total + sample.runs.length, 0)
        : 0,
    }, null, 2));

    if (DRY_RUN) return;
    if (CLEANUP) {
      console.log(`Removed ${await removeSamples(client, target.organization_id)} sample automations.`);
      return;
    }

    await seed(client, target, contacts);
    const seeded = await listSamples(client, target.organization_id);
    console.log(JSON.stringify({
      seededSampleAutomations: seeded.length,
      seededSampleRuns: seeded.reduce((total, workflow) => total + Number(workflow.run_count), 0),
      automations: seeded,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
