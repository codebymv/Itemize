const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED = 'campaigns-ui-20260828';
const PREFIX = 'QA Sample · ';
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const yearsFromNow = (years) => new Date(Date.now() + years * 365 * DAY_MS);

const emailTemplates = [
  {
    name: `${PREFIX}New Client Welcome`,
    subject: 'Welcome, {{first_name}} — here is what happens next',
    category: 'Onboarding',
    isActive: true,
    variables: ['first_name', 'company'],
    bodyText: 'Hi {{first_name}}, welcome to Itemize. We are excited to help {{company}} get started.',
    bodyHtml: '<h1>Welcome, {{first_name}}</h1><p>We are excited to help <strong>{{company}}</strong> get started.</p><p>Here is what happens next.</p>',
  },
  {
    name: `${PREFIX}Project Proposal Follow-up`,
    subject: 'A quick follow-up on your proposal',
    category: 'Sales',
    isActive: true,
    variables: ['first_name', 'project_name'],
    bodyText: 'Hi {{first_name}}, do you have any questions about the proposal for {{project_name}}?',
    bodyHtml: '<h1>Any questions?</h1><p>Hi {{first_name}}, I wanted to follow up on the proposal for <strong>{{project_name}}</strong>.</p>',
  },
  {
    name: `${PREFIX}Invoice Reminder`,
    subject: 'Friendly reminder: invoice {{invoice_number}}',
    category: 'Billing',
    isActive: true,
    variables: ['first_name', 'invoice_number', 'balance_due'],
    bodyText: 'Hi {{first_name}}, invoice {{invoice_number}} has a remaining balance of {{balance_due}}.',
    bodyHtml: '<h1>Invoice reminder</h1><p>Hi {{first_name}}, invoice <strong>{{invoice_number}}</strong> has a remaining balance of {{balance_due}}.</p>',
  },
  {
    name: `${PREFIX}Monthly Product Update`,
    subject: 'What is new this month',
    category: 'Newsletter',
    isActive: true,
    variables: ['first_name'],
    bodyText: 'Hi {{first_name}}, here are this month’s product improvements and helpful tips.',
    bodyHtml: '<h1>This month in Itemize</h1><p>Hi {{first_name}}, here are the latest improvements and helpful tips.</p>',
  },
  {
    name: `${PREFIX}Customer Check-in`,
    subject: 'How is everything going, {{first_name}}?',
    category: 'Retention',
    isActive: true,
    variables: ['first_name', 'owner_name'],
    bodyText: 'Hi {{first_name}}, {{owner_name}} here. I wanted to check in and see how everything is going.',
    bodyHtml: '<h1>Checking in</h1><p>Hi {{first_name}}, {{owner_name}} here. How is everything going?</p>',
  },
  {
    name: `${PREFIX}Legacy Event Invitation`,
    subject: 'You are invited to our customer workshop',
    category: 'Events',
    isActive: false,
    variables: ['first_name', 'event_date'],
    bodyText: 'Hi {{first_name}}, join us for a customer workshop on {{event_date}}.',
    bodyHtml: '<h1>You are invited</h1><p>Hi {{first_name}}, join us for a customer workshop on {{event_date}}.</p>',
  },
];

const smsTemplates = [
  {
    name: `${PREFIX}Appointment Confirmation`,
    message: 'Hi {{first_name}}, your appointment is confirmed for {{appointment_time}}. Reply C to confirm or R to reschedule.',
    category: 'Scheduling',
    isActive: true,
    variables: ['first_name', 'appointment_time'],
  },
  {
    name: `${PREFIX}Payment Received`,
    message: 'Thanks {{first_name}} — we received your payment of {{payment_amount}} for invoice {{invoice_number}}.',
    category: 'Billing',
    isActive: true,
    variables: ['first_name', 'payment_amount', 'invoice_number'],
  },
  {
    name: `${PREFIX}Proposal Follow-up`,
    message: 'Hi {{first_name}}, checking in on the {{project_name}} proposal. Reply here if you have any questions.',
    category: 'Sales',
    isActive: true,
    variables: ['first_name', 'project_name'],
  },
  {
    name: `${PREFIX}Project Update`,
    message: 'Hi {{first_name}}, your {{project_name}} project has a new update. View it here: {{project_link}}',
    category: 'Updates',
    isActive: true,
    variables: ['first_name', 'project_name', 'project_link'],
  },
  {
    name: `${PREFIX}Review Request`,
    message: 'Thanks for working with us, {{first_name}}. Would you share your experience? {{review_link}}',
    category: 'Retention',
    isActive: true,
    variables: ['first_name', 'review_link'],
  },
  {
    name: `${PREFIX}Legacy Open House`,
    message: 'Hi {{first_name}}, our open house is on {{event_date}} at {{event_time}}. Reply STOP to opt out.',
    category: 'Events',
    isActive: false,
    variables: ['first_name', 'event_date', 'event_time'],
  },
];

const segmentDefinitions = (contactIds) => [
  {
    name: `${PREFIX}Active Customers`,
    description: 'Contacts currently marked active and ready for ongoing outreach.',
    color: '#2563EB',
    icon: 'users',
    filterType: 'and',
    filters: [{ field: 'status', operator: 'equals', value: 'active' }],
    segmentType: 'dynamic',
    staticContactIds: [],
    isActive: true,
    usedInCampaigns: 3,
    usedInAutomations: 2,
    count: null,
  },
  {
    name: `${PREFIX}Recently Added`,
    description: 'Contacts created during the last 90 days.',
    color: '#2563EB',
    icon: 'refresh-cw',
    filterType: 'and',
    filters: [{ field: 'created_at', operator: 'last_n_days', value: 90 }],
    segmentType: 'dynamic',
    staticContactIds: [],
    isActive: true,
    usedInCampaigns: 1,
    usedInAutomations: 1,
    count: null,
  },
  {
    name: `${PREFIX}Email Ready`,
    description: 'Contacts with an email address available for campaign delivery.',
    color: '#2563EB',
    icon: 'mail',
    filterType: 'and',
    filters: [{ field: 'email', operator: 'is_not_empty' }],
    segmentType: 'dynamic',
    staticContactIds: [],
    isActive: true,
    usedInCampaigns: 4,
    usedInAutomations: 0,
    count: null,
  },
  {
    name: `${PREFIX}Unassigned Follow-up`,
    description: 'Contacts that still need an owner assigned.',
    color: '#F97316',
    icon: 'user-plus',
    filterType: 'and',
    filters: [{ field: 'assigned_to', operator: 'is_empty' }],
    segmentType: 'dynamic',
    staticContactIds: [],
    isActive: false,
    usedInCampaigns: 0,
    usedInAutomations: 1,
    count: null,
  },
  {
    name: `${PREFIX}Priority Accounts`,
    description: 'A hand-picked group for high-touch client communication.',
    color: '#2563EB',
    icon: 'star',
    filterType: 'and',
    filters: [],
    segmentType: 'static',
    staticContactIds: contactIds.slice(0, Math.min(2, contactIds.length)),
    isActive: true,
    usedInCampaigns: 2,
    usedInAutomations: 1,
    count: Math.min(2, contactIds.length),
  },
  {
    name: `${PREFIX}Workshop Guests`,
    description: 'A saved contact list for event announcements and reminders.',
    color: '#2563EB',
    icon: 'calendar',
    filterType: 'and',
    filters: [],
    segmentType: 'static',
    staticContactIds: contactIds,
    isActive: true,
    usedInCampaigns: 1,
    usedInAutomations: 0,
    count: contactIds.length,
  },
];

const campaignDefinitions = () => [
  {
    name: `${PREFIX}September Product Update`, status: 'draft', templateName: `${PREFIX}Monthly Product Update`,
    subject: 'September updates built to save you time', recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0,
    openRate: 0, clickRate: 0, bounceRate: 0, createdDaysAgo: 1,
  },
  {
    name: `${PREFIX}Referral Partner Introduction`, status: 'draft', templateName: `${PREFIX}Project Proposal Follow-up`,
    subject: 'A better way to manage the work after the handshake', recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0,
    openRate: 0, clickRate: 0, bounceRate: 0, createdDaysAgo: 3,
  },
  {
    name: `${PREFIX}Client Appreciation Note`, status: 'scheduled', templateName: `${PREFIX}Customer Check-in`,
    subject: 'A quick thank-you from our team', recipients: 3, sent: 0, delivered: 0, opened: 0, clicked: 0,
    openRate: 0, clickRate: 0, bounceRate: 0, createdDaysAgo: 5, scheduledAt: yearsFromNow(10),
  },
  {
    name: `${PREFIX}Fall Service Announcement`, status: 'sending', templateName: `${PREFIX}Monthly Product Update`,
    subject: 'A service update for the season ahead', recipients: 3, sent: 2, delivered: 2, opened: 1, clicked: 0,
    bounced: 0, openRate: 50, clickRate: 0, bounceRate: 0, createdDaysAgo: 7, startedDaysAgo: 1,
  },
  {
    name: `${PREFIX}Dormant Lead Re-engagement`, status: 'paused', templateName: `${PREFIX}Project Proposal Follow-up`,
    subject: 'Still planning your next project?', recipients: 3, sent: 2, delivered: 2, opened: 1, clicked: 0,
    bounced: 0, openRate: 50, clickRate: 0, bounceRate: 0, createdDaysAgo: 9, startedDaysAgo: 3,
  },
  {
    name: `${PREFIX}August Customer Newsletter`, status: 'sent', templateName: `${PREFIX}Monthly Product Update`,
    subject: 'August product news and practical tips', recipients: 3, sent: 3, delivered: 2, opened: 2, clicked: 1,
    bounced: 1, openRate: 100, clickRate: 50, bounceRate: 33.33, createdDaysAgo: 22, startedDaysAgo: 20, completedDaysAgo: 20,
  },
  {
    name: `${PREFIX}Summer Workshop Invitation`, status: 'sent', templateName: `${PREFIX}Legacy Event Invitation`,
    subject: 'Reserve your seat for our customer workshop', recipients: 3, sent: 3, delivered: 2, opened: 2, clicked: 1,
    bounced: 1, openRate: 100, clickRate: 50, bounceRate: 33.33, createdDaysAgo: 38, startedDaysAgo: 35, completedDaysAgo: 35,
  },
  {
    name: `${PREFIX}Billing Policy Notice`, status: 'failed', templateName: `${PREFIX}Invoice Reminder`,
    subject: 'Important billing policy update', recipients: 3, sent: 1, delivered: 0, opened: 0, clicked: 0,
    bounced: 1, openRate: 0, clickRate: 0, bounceRate: 100, createdDaysAgo: 14, startedDaysAgo: 13,
  },
  {
    name: `${PREFIX}Spring Promotion`, status: 'cancelled', templateName: `${PREFIX}Project Proposal Follow-up`,
    subject: 'A spring offer for your next project', recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0,
    openRate: 0, clickRate: 0, bounceRate: 0, createdDaysAgo: 70,
  },
];

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT users.id AS user_id, users.email, organizations.id AS organization_id,
            organizations.name AS organization_name, organizations.plan
     FROM users
     JOIN organization_members membership ON membership.user_id = users.id
     JOIN organizations ON organizations.id = membership.organization_id
     WHERE lower(users.email) = lower($1)
     ORDER BY (organizations.id = users.default_organization_id) DESC,
              membership.joined_at, organizations.id
     LIMIT 1`,
    [OWNER_EMAIL],
  );
  if (!result.rows[0]) throw new Error(`No organization membership found for ${OWNER_EMAIL}`);
  return result.rows[0];
}

async function getContacts(client, organizationId) {
  return (await client.query(
    `SELECT id, first_name, last_name, email, status, source, assigned_to, created_at
     FROM contacts WHERE organization_id = $1 ORDER BY created_at, id LIMIT 20`,
    [organizationId],
  )).rows;
}

async function findExact(client, table, organizationId, name) {
  const allowed = new Set(['email_campaigns', 'segments', 'email_templates', 'sms_templates']);
  if (!allowed.has(table)) throw new Error(`Unsupported seed table ${table}`);
  const result = await client.query(
    `SELECT id FROM ${table} WHERE organization_id = $1 AND name = $2 ORDER BY id`,
    [organizationId, name],
  );
  if (result.rowCount > 1) throw new Error(`Multiple ${table} rows already use the seed name: ${name}`);
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

async function upsertEmailTemplate(client, target, sample, index) {
  const existingId = await findExact(client, 'email_templates', target.organization_id, sample.name);
  const timestamps = [daysAgo(45 - index * 4), daysAgo(index + 1)];
  if (existingId) {
    await client.query(
      `UPDATE email_templates SET subject=$3, body_html=$4, body_text=$5, variables=$6::jsonb,
         category=$7, is_active=$8, created_by=$9, created_at=$10, updated_at=$11
       WHERE id=$1 AND organization_id=$2`,
      [existingId, target.organization_id, sample.subject, sample.bodyHtml, sample.bodyText,
        JSON.stringify(sample.variables), sample.category, sample.isActive, target.user_id, ...timestamps],
    );
    return existingId;
  }
  return Number((await client.query(
    `INSERT INTO email_templates
       (organization_id,name,subject,body_html,body_text,variables,category,is_active,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id`,
    [target.organization_id, sample.name, sample.subject, sample.bodyHtml, sample.bodyText,
      JSON.stringify(sample.variables), sample.category, sample.isActive, target.user_id, ...timestamps],
  )).rows[0].id);
}

async function upsertSmsTemplate(client, target, sample, index) {
  const existingId = await findExact(client, 'sms_templates', target.organization_id, sample.name);
  const timestamps = [daysAgo(40 - index * 3), daysAgo(index + 1)];
  if (existingId) {
    await client.query(
      `UPDATE sms_templates SET message=$3, variables=$4::jsonb, category=$5, is_active=$6,
         created_by=$7, created_at=$8, updated_at=$9 WHERE id=$1 AND organization_id=$2`,
      [existingId, target.organization_id, sample.message, JSON.stringify(sample.variables),
        sample.category, sample.isActive, target.user_id, ...timestamps],
    );
    return existingId;
  }
  return Number((await client.query(
    `INSERT INTO sms_templates
       (organization_id,name,message,variables,category,is_active,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) RETURNING id`,
    [target.organization_id, sample.name, sample.message, JSON.stringify(sample.variables),
      sample.category, sample.isActive, target.user_id, ...timestamps],
  )).rows[0].id);
}

async function dynamicSegmentCount(client, organizationId, sample) {
  const filter = sample.filters[0];
  if (filter.field === 'status') {
    return Number((await client.query(
      'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id=$1 AND status=$2',
      [organizationId, filter.value],
    )).rows[0].total);
  }
  if (filter.field === 'created_at') {
    return Number((await client.query(
      `SELECT COUNT(*)::int AS total FROM contacts
       WHERE organization_id=$1 AND created_at >= NOW() - ($2::int * INTERVAL '1 day')`,
      [organizationId, filter.value],
    )).rows[0].total);
  }
  if (filter.field === 'email') {
    return Number((await client.query(
      `SELECT COUNT(*)::int AS total FROM contacts
       WHERE organization_id=$1 AND email IS NOT NULL AND email != ''`,
      [organizationId],
    )).rows[0].total);
  }
  if (filter.field === 'assigned_to') {
    return Number((await client.query(
      'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id=$1 AND assigned_to IS NULL',
      [organizationId],
    )).rows[0].total);
  }
  throw new Error(`Unsupported sample segment filter ${filter.field}`);
}

async function upsertSegment(client, target, sample, index) {
  const existingId = await findExact(client, 'segments', target.organization_id, sample.name);
  const contactCount = sample.count ?? await dynamicSegmentCount(client, target.organization_id, sample);
  const timestamps = [daysAgo(34 - index * 3), daysAgo(index + 1)];
  const values = [sample.description, sample.color, sample.icon, sample.filterType,
    JSON.stringify(sample.filters), sample.segmentType, sample.staticContactIds, contactCount,
    daysAgo(index + 1), sample.isActive, sample.usedInCampaigns, sample.usedInAutomations,
    target.user_id, ...timestamps];
  if (existingId) {
    await client.query(
      `UPDATE segments SET description=$3,color=$4,icon=$5,filter_type=$6,filters=$7::jsonb,
         segment_type=$8,static_contact_ids=$9::int[],contact_count=$10,last_calculated_at=$11,
         is_active=$12,used_in_campaigns=$13,used_in_automations=$14,created_by=$15,
         created_at=$16,updated_at=$17 WHERE id=$1 AND organization_id=$2`,
      [existingId, target.organization_id, ...values],
    );
    return existingId;
  }
  return Number((await client.query(
    `INSERT INTO segments
       (organization_id,name,description,color,icon,filter_type,filters,segment_type,
        static_contact_ids,contact_count,last_calculated_at,is_active,used_in_campaigns,
        used_in_automations,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::int[],$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [target.organization_id, sample.name, ...values],
  )).rows[0].id);
}

async function upsertCampaign(client, target, sample, templateIds, index) {
  const existingId = await findExact(client, 'email_campaigns', target.organization_id, sample.name);
  const marker = JSON.stringify({ sample: true, seed: SEED });
  const templateId = templateIds.get(sample.templateName) ?? null;
  const bounced = Math.max(0, sample.bounced ?? (sample.sent - sample.delivered));
  const timestamps = {
    scheduledAt: sample.scheduledAt ?? null,
    startedAt: sample.startedDaysAgo === undefined ? null : daysAgo(sample.startedDaysAgo),
    completedAt: sample.completedDaysAgo === undefined ? null : daysAgo(sample.completedDaysAgo),
    createdAt: daysAgo(sample.createdDaysAgo),
    updatedAt: daysAgo(Math.max(0, sample.completedDaysAgo ?? sample.startedDaysAgo ?? index)),
  };
  const values = [sample.subject, 'Itemize QA', OWNER_EMAIL, OWNER_EMAIL, templateId,
    null, null, 'all', marker, sample.status,
    timestamps.scheduledAt, false, 'America/Phoenix', sample.recipients, sample.sent,
    sample.delivered, sample.opened, sample.clicked, bounced, sample.openRate, sample.clickRate,
    sample.bounceRate, target.user_id, sample.status === 'sent' ? target.user_id : null,
    timestamps.startedAt, timestamps.completedAt, timestamps.createdAt, timestamps.updatedAt];
  if (existingId) {
    await client.query(
      `UPDATE email_campaigns SET subject=$3,from_name=$4,from_email=$5,reply_to=$6,
         template_id=$7,content_html=$8,content_text=$9,segment_type=$10,segment_id=NULL,
         segment_filter=$11::jsonb,tag_ids='{}'::int[],excluded_tag_ids='{}'::int[],status=$12,
         scheduled_at=$13,send_immediately=$14,timezone=$15,total_recipients=$16,total_sent=$17,
         total_delivered=$18,total_opened=$19,total_clicked=$20,total_bounced=$21,
         total_unsubscribed=0,total_complained=0,open_rate=$22,click_rate=$23,bounce_rate=$24,
         created_by=$25,sent_by=$26,started_at=$27,completed_at=$28,created_at=$29,updated_at=$30
       WHERE id=$1 AND organization_id=$2`,
      [existingId, target.organization_id, ...values],
    );
    return existingId;
  }
  return Number((await client.query(
    `INSERT INTO email_campaigns
       (organization_id,name,subject,from_name,from_email,reply_to,template_id,content_html,
        content_text,segment_type,segment_filter,status,scheduled_at,send_immediately,timezone,
        total_recipients,total_sent,total_delivered,total_opened,total_clicked,total_bounced,
        total_unsubscribed,total_complained,open_rate,click_rate,bounce_rate,created_by,sent_by,
        started_at,completed_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,
             $20,$21,0,0,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING id`,
    [target.organization_id, sample.name, ...values],
  )).rows[0].id);
}

const recipientStatusesFor = (campaignStatus) => {
  if (campaignStatus === 'sending') return ['opened', 'delivered', 'pending'];
  if (campaignStatus === 'paused') return ['opened', 'delivered', 'pending'];
  if (campaignStatus === 'sent') return ['clicked', 'opened', 'bounced'];
  if (campaignStatus === 'failed') return ['failed', 'bounced', 'failed'];
  return [];
};

async function seedCampaignActivity(client, target, contacts, campaignSamples, campaignIds) {
  const ids = [...campaignIds.values()];
  await client.query('DELETE FROM campaign_recipients WHERE campaign_id = ANY($1::int[])', [ids]);
  await client.query('DELETE FROM campaign_links WHERE campaign_id = ANY($1::int[])', [ids]);

  const deliverableContacts = contacts.filter(contact => contact.email).slice(0, 3);
  for (const sample of campaignSamples) {
    if (sample.status === 'sending' && sample.sent >= sample.recipients) {
      throw new Error(`Sending sample must retain at least one unsent recipient: ${sample.name}`);
    }
    const campaignId = campaignIds.get(sample.name);
    const statuses = recipientStatusesFor(sample.status);
    const eventAt = daysAgo(sample.startedDaysAgo ?? sample.createdDaysAgo);

    for (const [index, contact] of deliverableContacts.entries()) {
      const status = statuses[index];
      if (!status) continue;
      const sentAt = status === 'pending' || status === 'failed' ? null : eventAt;
      const deliveredAt = ['delivered', 'opened', 'clicked'].includes(status)
        ? new Date(eventAt.getTime() + (index + 1) * 15 * 60 * 1000)
        : null;
      const openedAt = ['opened', 'clicked'].includes(status)
        ? new Date(eventAt.getTime() + (index + 1) * 45 * 60 * 1000)
        : null;
      const clickedAt = status === 'clicked'
        ? new Date(eventAt.getTime() + (index + 1) * 90 * 60 * 1000)
        : null;
      const bouncedAt = status === 'bounced'
        ? new Date(eventAt.getTime() + (index + 1) * 20 * 60 * 1000)
        : null;
      const clickedLinks = status === 'clicked'
        ? JSON.stringify(['https://example.com/product-updates'])
        : JSON.stringify([]);

      await client.query(
        `INSERT INTO campaign_recipients
           (campaign_id,contact_id,organization_id,email,first_name,last_name,status,
            sent_at,delivered_at,opened_at,clicked_at,bounced_at,open_count,click_count,
            clicked_links,error_message,bounce_type,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`,
        [campaignId, Number(contact.id), target.organization_id, contact.email,
          contact.first_name, contact.last_name, status, sentAt, deliveredAt, openedAt,
          clickedAt, bouncedAt, openedAt ? 1 : 0, clickedAt ? 1 : 0, clickedLinks,
          status === 'failed' ? 'Sample delivery failure for interface testing' : null,
          status === 'bounced' ? 'hard' : null, daysAgo(sample.createdDaysAgo),
          clickedAt || openedAt || deliveredAt || bouncedAt || sentAt || eventAt],
      );
    }

    if (!['sending', 'paused', 'sent'].includes(sample.status)) continue;
    const primaryClicks = Math.max(1, Math.round(sample.clicked * 0.62));
    const secondaryClicks = Math.max(0, sample.clicked - primaryClicks);
    const linkSamples = [
      {
        url: 'https://example.com/product-updates',
        text: 'Explore product updates',
        total: primaryClicks,
        unique: Math.max(1, Math.round(primaryClicks * 0.82)),
      },
      {
        url: 'https://example.com/help/getting-started',
        text: 'Read the getting started guide',
        total: secondaryClicks,
        unique: Math.round(secondaryClicks * 0.8),
      },
    ];
    for (const [index, link] of linkSamples.entries()) {
      await client.query(
        `INSERT INTO campaign_links
           (campaign_id,original_url,tracking_url,link_text,link_position,total_clicks,unique_clicks,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [campaignId, link.url, `${link.url}?utm_source=itemize_sample`, link.text, index + 1,
          link.total, link.unique, daysAgo(sample.createdDaysAgo)],
      );
    }
  }
}

async function listSamples(client, organizationId) {
  const campaigns = await client.query(
    `SELECT status, COUNT(*)::int AS count FROM email_campaigns
     WHERE organization_id=$1 AND segment_filter @> $2::jsonb GROUP BY status ORDER BY status`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  const segments = await client.query(
    `SELECT segment_type, is_active, COUNT(*)::int AS count FROM segments
     WHERE organization_id=$1 AND name = ANY($2::text[]) GROUP BY segment_type,is_active ORDER BY segment_type,is_active`,
    [organizationId, segmentDefinitions([]).map(sample => sample.name)],
  );
  const emails = await client.query(
    `SELECT is_active, COUNT(*)::int AS count FROM email_templates
     WHERE organization_id=$1 AND name = ANY($2::text[]) GROUP BY is_active ORDER BY is_active`,
    [organizationId, emailTemplates.map(sample => sample.name)],
  );
  const sms = await client.query(
    `SELECT is_active, COUNT(*)::int AS count FROM sms_templates
     WHERE organization_id=$1 AND name = ANY($2::text[]) GROUP BY is_active ORDER BY is_active`,
    [organizationId, smsTemplates.map(sample => sample.name)],
  );
  const activity = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM campaign_recipients recipients
        JOIN email_campaigns campaign ON campaign.id=recipients.campaign_id
        WHERE campaign.organization_id=$1 AND campaign.segment_filter @> $2::jsonb) AS recipient_records,
       (SELECT COUNT(*)::int FROM campaign_links links
        JOIN email_campaigns campaign ON campaign.id=links.campaign_id
        WHERE campaign.organization_id=$1 AND campaign.segment_filter @> $2::jsonb) AS tracked_links`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  );
  return {
    campaigns: campaigns.rows,
    segments: segments.rows,
    emailTemplates: emails.rows,
    smsTemplates: sms.rows,
    recipientRecords: activity.rows[0].recipient_records,
    trackedLinks: activity.rows[0].tracked_links,
  };
}

async function removeSamples(client, organizationId) {
  const result = {};
  result.campaigns = (await client.query(
    `DELETE FROM email_campaigns WHERE organization_id=$1 AND segment_filter @> $2::jsonb RETURNING id`,
    [organizationId, JSON.stringify({ sample: true, seed: SEED })],
  )).rowCount || 0;
  result.segments = (await client.query(
    'DELETE FROM segments WHERE organization_id=$1 AND name = ANY($2::text[]) RETURNING id',
    [organizationId, segmentDefinitions([]).map(sample => sample.name)],
  )).rowCount || 0;
  result.emailTemplates = (await client.query(
    'DELETE FROM email_templates WHERE organization_id=$1 AND name = ANY($2::text[]) RETURNING id',
    [organizationId, emailTemplates.map(sample => sample.name)],
  )).rowCount || 0;
  result.smsTemplates = (await client.query(
    'DELETE FROM sms_templates WHERE organization_id=$1 AND name = ANY($2::text[]) RETURNING id',
    [organizationId, smsTemplates.map(sample => sample.name)],
  )).rowCount || 0;
  return result;
}

async function seed(client, target, contacts) {
  if (contacts.length < 1) throw new Error('At least one contact is required to seed useful segment samples');
  const templateIds = new Map();
  for (const [index, sample] of emailTemplates.entries()) {
    templateIds.set(sample.name, await upsertEmailTemplate(client, target, sample, index));
  }
  for (const [index, sample] of smsTemplates.entries()) await upsertSmsTemplate(client, target, sample, index);
  const segmentSamples = segmentDefinitions(contacts.map(contact => Number(contact.id)));
  for (const [index, sample] of segmentSamples.entries()) await upsertSegment(client, target, sample, index);
  const campaignSamples = campaignDefinitions();
  const campaignIds = new Map();
  for (const [index, sample] of campaignSamples.entries()) {
    campaignIds.set(sample.name, await upsertCampaign(client, target, sample, templateIds, index));
  }
  await seedCampaignActivity(client, target, contacts, campaignSamples, campaignIds);
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
      },
      availableContacts: contacts.length,
      existing,
      planned: APPLY || DRY_RUN ? {
        campaigns: campaignDefinitions().length,
        segments: segmentDefinitions(contacts.map(contact => Number(contact.id))).length,
        emailTemplates: emailTemplates.length,
        smsTemplates: smsTemplates.length,
      } : undefined,
    }, null, 2));
    if (DRY_RUN) return;

    await client.query('BEGIN');
    try {
      if (CLEANUP) console.log(JSON.stringify({ removed: await removeSamples(client, target.organization_id) }, null, 2));
      else await seed(client, target, contacts);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    if (APPLY) console.log(JSON.stringify({ seeded: await listSamples(client, target.organization_id) }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
