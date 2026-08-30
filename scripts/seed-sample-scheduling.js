const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim() || '';
const OWNER_NAME = process.env.SEED_OWNER_NAME?.trim() || '';
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED = 'scheduling-ui-20260829';
const SLUG_PREFIX = 'qa-sample-';
const DAY_MS = 24 * 60 * 60 * 1000;

const calendarSamples = [
  {
    slug: `${SLUG_PREFIX}discovery-call`,
    name: 'QA Sample · Discovery Call',
    description: 'A focused introduction for new client opportunities',
    duration: 30,
    color: '#2563EB',
    active: true,
    timezone: 'America/Phoenix',
  },
  {
    slug: `${SLUG_PREFIX}project-check-in`,
    name: 'QA Sample · Project Check-in',
    description: 'Progress review for active client work',
    duration: 45,
    color: '#16A34A',
    active: true,
    timezone: 'America/Phoenix',
  },
  {
    slug: `${SLUG_PREFIX}legacy-consultation`,
    name: 'QA Sample · Legacy Consultation',
    description: '',
    duration: 60,
    color: '#F97316',
    active: false,
    timezone: 'America/Los_Angeles',
  },
];

const attendeeFallbacks = [
  { name: 'Maya Patel', email: 'maya.patel@northstar-studio.test', phone: '+16025550121' },
  { name: 'Noah Williams', email: 'noah.williams@brightline-consulting.test', phone: '+16025550122' },
  { name: 'Elena Rivera', email: 'elena.rivera@meridian-health.test', phone: '+16025550123' },
  { name: 'Jordan Lee', email: 'jordan.lee@brightline-consulting.test', phone: '+16025550124' },
];

const bookingSamples = [
  { calendar: 0, attendee: 0, days: 1, hour: 10, status: 'confirmed', title: 'Website redesign discovery', notes: 'Interested in a phased launch.' },
  { calendar: 1, attendee: 1, days: 2, hour: 13, status: 'pending', title: 'Campaign performance review', notes: 'Review August reporting.' },
  { calendar: 0, attendee: 2, days: 5, hour: 15, status: 'confirmed', title: 'Program planning call' },
  { calendar: 1, attendee: 3, days: 10, hour: 9, status: 'confirmed', title: 'Quarterly project check-in' },
  { calendar: 0, attendee: 1, days: -2, hour: 11, status: 'completed', title: 'Proposal walkthrough' },
  { calendar: 1, attendee: 2, days: -1, hour: 14, status: 'cancelled', title: 'Implementation check-in', cancellationReason: 'Attendee requested a new date.' },
  { calendar: 2, attendee: 3, days: -4, hour: 16, status: 'no_show', title: 'Legacy account consultation' },
];

function zonedParts(date, timezone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
}

function appointmentAt(days, hour, timezone) {
  const now = zonedParts(new Date(), timezone);
  const targetDate = new Date(Date.UTC(now.year, now.month - 1, now.day + days));
  const weekdayDirection = days >= 0 ? 1 : -1;
  while (targetDate.getUTCDay() === 0 || targetDate.getUTCDay() === 6) {
    targetDate.setUTCDate(targetDate.getUTCDate() + weekdayDirection);
  }
  const target = {
    year: targetDate.getUTCFullYear(),
    month: targetDate.getUTCMonth() + 1,
    day: targetDate.getUTCDate(),
    hour,
    minute: 0,
    second: 0,
  };
  const targetWallTime = Date.UTC(target.year, target.month - 1, target.day, target.hour, 0, 0);
  let timestamp = targetWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(timestamp), timezone);
    const renderedWallTime = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    timestamp += targetWallTime - renderedWallTime;
  }
  return new Date(timestamp);
}

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT users.id AS user_id, users.email, users.name,
            organizations.id AS organization_id, organizations.name AS organization_name
     FROM users
     JOIN organization_members membership ON membership.user_id=users.id
     JOIN organizations ON organizations.id=membership.organization_id
     WHERE ($1 <> '' AND lower(users.email)=lower($1))
        OR ($2 <> '' AND lower(users.name)=lower($2))
     ORDER BY (lower(users.email)=lower($1)) DESC,
              (organizations.id=users.default_organization_id) DESC,
              membership.joined_at, organizations.id
     LIMIT 1`,
    [OWNER_EMAIL, OWNER_NAME],
  );
  if (!result.rows[0]) throw new Error(`No organization membership found for ${OWNER_EMAIL || OWNER_NAME}`);
  return result.rows[0];
}

async function getContacts(client, organizationId) {
  const result = await client.query(
    `SELECT id, first_name, last_name, email, phone
     FROM contacts
     WHERE organization_id=$1
     ORDER BY created_at, id
     LIMIT 4`,
    [organizationId],
  );
  return result.rows;
}

async function listSamples(client, organizationId) {
  const calendars = await client.query(
    `SELECT is_active, COUNT(*)::int AS count
     FROM calendars
     WHERE organization_id=$1 AND slug LIKE $2
     GROUP BY is_active ORDER BY is_active DESC`,
    [organizationId, `${SLUG_PREFIX}%`],
  );
  const bookings = await client.query(
    `SELECT status, COUNT(*)::int AS count
     FROM bookings
     WHERE organization_id=$1 AND custom_fields @> $2::jsonb
     GROUP BY status ORDER BY status`,
    [organizationId, JSON.stringify({ seed: SEED })],
  );
  return { calendars: calendars.rows, bookings: bookings.rows };
}

async function removeSamples(client, organizationId) {
  const result = await client.query(
    `DELETE FROM calendars
     WHERE organization_id=$1 AND slug LIKE $2
     RETURNING id`,
    [organizationId, `${SLUG_PREFIX}%`],
  );
  return { calendars: result.rowCount || 0 };
}

async function upsertCalendars(client, target) {
  const calendarIds = [];
  for (const sample of calendarSamples) {
    const result = await client.query(
      `INSERT INTO calendars (
         organization_id,name,description,slug,timezone,duration_minutes,
         buffer_before_minutes,buffer_after_minutes,min_notice_hours,max_future_days,
         assigned_to,assignment_mode,confirmation_email,reminder_email,reminder_hours,
         color,is_active,created_by,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,0,10,4,60,$7,'specific',TRUE,TRUE,24,$8,$9,$7,NOW(),NOW())
       ON CONFLICT (organization_id,slug) DO UPDATE SET
         name=EXCLUDED.name,description=EXCLUDED.description,timezone=EXCLUDED.timezone,
         duration_minutes=EXCLUDED.duration_minutes,buffer_before_minutes=EXCLUDED.buffer_before_minutes,
         buffer_after_minutes=EXCLUDED.buffer_after_minutes,min_notice_hours=EXCLUDED.min_notice_hours,
         max_future_days=EXCLUDED.max_future_days,assigned_to=EXCLUDED.assigned_to,
         color=EXCLUDED.color,is_active=EXCLUDED.is_active,updated_at=NOW()
       RETURNING id`,
      [
        target.organization_id,
        sample.name,
        sample.description,
        sample.slug,
        sample.timezone,
        sample.duration,
        target.user_id,
        sample.color,
        sample.active,
      ],
    );
    const calendarId = Number(result.rows[0].id);
    calendarIds.push(calendarId);

    await client.query('DELETE FROM availability_windows WHERE calendar_id=$1', [calendarId]);
    for (const day of [1, 2, 3, 4, 5]) {
      await client.query(
        `INSERT INTO availability_windows
           (calendar_id,day_of_week,start_time,end_time,is_active)
         VALUES ($1,$2,'09:00','17:00',TRUE)`,
        [calendarId, day],
      );
    }

    await client.query('DELETE FROM calendar_date_overrides WHERE calendar_id=$1', [calendarId]);
    if (sample.active) {
      const overrideDate = new Date(Date.now() + 21 * DAY_MS).toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO calendar_date_overrides
           (calendar_id,override_date,is_available,reason)
         VALUES ($1,$2,FALSE,'Team planning day')`,
        [calendarId, overrideDate],
      );
    }
  }
  return calendarIds;
}

async function seedBookings(client, target, contacts, calendarIds) {
  await client.query(
    `DELETE FROM bookings
     WHERE organization_id=$1 AND custom_fields @> $2::jsonb`,
    [target.organization_id, JSON.stringify({ seed: SEED })],
  );

  for (const sample of bookingSamples) {
    const fallback = attendeeFallbacks[sample.attendee];
    const contact = contacts[sample.attendee];
    const start = appointmentAt(sample.days, sample.hour, calendarSamples[sample.calendar].timezone);
    const duration = calendarSamples[sample.calendar].duration;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const attendeeName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || fallback.name
      : fallback.name;
    await client.query(
      `INSERT INTO bookings (
         organization_id,calendar_id,contact_id,title,start_time,end_time,timezone,
         attendee_name,attendee_email,attendee_phone,assigned_to,status,cancelled_at,
         cancellation_reason,notes,internal_notes,custom_fields,source,created_at,updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         'Seeded for scheduling UI validation',$16::jsonb,'booking_page',$17,$17
       )`,
      [
        target.organization_id,
        calendarIds[sample.calendar],
        contact?.id || null,
        sample.title,
        start,
        end,
        calendarSamples[sample.calendar].timezone,
        attendeeName,
        contact?.email || fallback.email,
        contact?.phone || fallback.phone,
        target.user_id,
        sample.status,
        sample.status === 'cancelled' ? new Date() : null,
        sample.cancellationReason || null,
        sample.notes || null,
        JSON.stringify({ seed: SEED, sample: true }),
        new Date(start.getTime() - 7 * DAY_MS),
      ],
    );
  }
}

async function main() {
  if ([DRY_RUN, APPLY, CLEANUP].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }
  if (!OWNER_EMAIL && !OWNER_NAME) throw new Error('SEED_OWNER_EMAIL or SEED_OWNER_NAME is required');
  const connectionString = process.env.SEED_DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('A database connection URL is required');

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const target = await resolveTarget(client);
    const existing = await listSamples(client, target.organization_id);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: { email: target.email, organization: target.organization_name },
      existing,
      planned: { calendars: calendarSamples.length, bookings: bookingSamples.length },
    }, null, 2));
    if (DRY_RUN) return;

    await client.query('BEGIN');
    if (CLEANUP) {
      console.log(JSON.stringify({ removed: await removeSamples(client, target.organization_id) }, null, 2));
    } else {
      const contacts = await getContacts(client, target.organization_id);
      const calendarIds = await upsertCalendars(client, target);
      await seedBookings(client, target, contacts, calendarIds);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ current: await listSamples(client, target.organization_id) }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
