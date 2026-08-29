const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED = 'pages-forms-ui-20260829';
const PREFIX = 'QA Sample · ';
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

const pageSectionSettings = (overrides = {}) => ({
  visible: true,
  animation: 'none',
  paddingTop: 56,
  paddingBottom: 56,
  paddingLeft: 24,
  paddingRight: 24,
  backgroundColor: null,
  backgroundImage: null,
  backgroundOverlay: null,
  maxWidth: '1200px',
  fullWidth: false,
  ...overrides,
});

const pageSamples = [
  {
    name: `${PREFIX}Client Welcome`,
    slug: 'qa-client-welcome',
    description: 'A polished welcome page for newly signed clients.',
    status: 'published',
    views: 124,
    visitors: 87,
    createdDaysAgo: 48,
    publishedDaysAgo: 41,
    seoTitle: 'Welcome to your next chapter',
    seoDescription: 'Meet your delivery team and see what happens next.',
    theme: { primaryColor: '#2563EB', secondaryColor: '#1E40AF', backgroundColor: '#FFFFFF', textColor: '#172033', fontFamily: 'Inter', headingFont: 'Inter', borderRadius: 12, spacing: 'normal' },
    sections: [
      { type: 'hero', name: 'Welcome', content: { heading: 'Welcome — let’s build something great', subheading: 'Your project is official. Meet the process, milestones, and people moving it forward.', cta_text: 'Review next steps', cta_url: '#next-steps', alignment: 'center', height: 'large' } },
      { type: 'features', name: 'Next steps', content: { heading: 'What happens next', subheading: 'A clear path from kickoff to launch.', columns: 3, items: [
        { icon: 'Calendar', title: 'Kickoff', description: 'Confirm goals, owners, and the working cadence.' },
        { icon: 'Layers', title: 'Delivery', description: 'Review progress through focused milestones.' },
        { icon: 'CheckCircle', title: 'Launch', description: 'Approve the final work and put it into motion.' },
      ] } },
      { type: 'testimonials', name: 'Client note', content: { heading: 'Built around good communication', subheading: '', layout: 'grid', columns: 1, items: [{ quote: 'The process was clear from day one, and every milestone felt easy to approve.', author: 'Jordan Lee', role: 'Operations Director', rating: 5 }] } },
      { type: 'cta', name: 'Questions', content: { heading: 'Have a question before kickoff?', description: 'Send it to your project lead and we’ll make sure it is covered.', button_text: 'Contact your lead', button_url: 'mailto:hello@example.com', style: 'primary' } },
      { type: 'footer', name: 'Footer', content: { copyright: '© 2026 Itemize QA', links: [{ text: 'Privacy', url: '#' }, { text: 'Contact', url: 'mailto:hello@example.com' }] }, settings: pageSectionSettings({ paddingTop: 28, paddingBottom: 28 }) },
    ],
  },
  {
    name: `${PREFIX}Service Consultation`,
    slug: 'qa-service-consultation',
    description: 'A conversion page for qualified service inquiries.',
    status: 'published',
    views: 73,
    visitors: 51,
    createdDaysAgo: 32,
    publishedDaysAgo: 25,
    seoTitle: 'Plan your next project',
    seoDescription: 'Tell us what you are building and book the right next conversation.',
    theme: { primaryColor: '#2563EB', secondaryColor: '#1D4ED8', backgroundColor: '#F8FAFC', textColor: '#172033', fontFamily: 'Inter', headingFont: 'Inter', borderRadius: 10, spacing: 'normal' },
    sections: [
      { type: 'hero', name: 'Consultation', content: { heading: 'Turn the next idea into a practical plan', subheading: 'Share the goal, constraints, and timing. We’ll recommend the clearest next step.', cta_text: 'Start your inquiry', cta_url: '#inquiry', alignment: 'left', height: 'medium' } },
      { type: 'text', name: 'How it works', content: { heading: 'A focused first conversation', body: '<p>We review your context before the call so the time can be spent on decisions, not discovery theatre.</p>', alignment: 'left' } },
      { type: 'form', name: 'Project inquiry', formKey: 'project-inquiry', content: { heading: 'Tell us about your project', subheading: 'A few details help us route your request.' } },
      { type: 'faq', name: 'Common questions', content: { heading: 'Before you submit', subheading: '', items: [
        { question: 'Is there a minimum project size?', answer: 'The sample workflow is designed for scoped business projects, but every inquiry is reviewed.' },
        { question: 'When will I hear back?', answer: 'Qualified requests normally receive a response within one business day.' },
      ] } },
    ],
  },
  {
    name: `${PREFIX}Autumn Workshop`,
    slug: 'qa-autumn-workshop',
    description: 'A draft event page awaiting final schedule details.',
    status: 'draft',
    views: 0,
    visitors: 0,
    createdDaysAgo: 8,
    theme: { primaryColor: '#EA580C', secondaryColor: '#9A3412', backgroundColor: '#FFF7ED', textColor: '#292524', fontFamily: 'Inter', headingFont: 'Inter', borderRadius: 14, spacing: 'normal' },
    sections: [
      { type: 'hero', name: 'Workshop invitation', content: { heading: 'A practical workshop for stronger client handoffs', subheading: 'An afternoon of repeatable systems, candid examples, and useful takeaways.', cta_text: 'Reserve a seat', cta_url: '#register', alignment: 'center', height: 'large' } },
      { type: 'countdown', name: 'Event countdown', content: { heading: 'Doors open soon', target_date: daysFromNow(45).toISOString(), expired_text: 'The workshop has started!', show_days: true, show_hours: true, show_minutes: true, show_seconds: false } },
      { type: 'faq', name: 'Workshop details', content: { heading: 'What to expect', items: [
        { question: 'Who is this for?', answer: 'Client-facing teams who want a cleaner transition from sale to delivery.' },
        { question: 'What should I bring?', answer: 'Bring one real workflow you want to improve.' },
      ] } },
      { type: 'cta', name: 'Registration', content: { heading: 'Save your place', description: 'Registration will open once the venue is confirmed.', button_text: 'Join the waitlist', button_url: '#', style: 'primary' } },
    ],
  },
  {
    name: `${PREFIX}Product Launch`,
    slug: 'qa-product-launch',
    description: 'A draft launch page used to test richer section layouts.',
    status: 'draft',
    views: 0,
    visitors: 0,
    createdDaysAgo: 5,
    theme: { primaryColor: '#2563EB', secondaryColor: '#4338CA', backgroundColor: '#FFFFFF', textColor: '#111827', fontFamily: 'Inter', headingFont: 'Inter', borderRadius: 12, spacing: 'normal' },
    sections: [
      { type: 'hero', name: 'Launch hero', content: { heading: 'The work after the handshake, finally organized', subheading: 'One connected place for client work, communication, documents, and revenue.', cta_text: 'See what is new', cta_url: '#features', alignment: 'center', height: 'large' } },
      { type: 'features', name: 'Highlights', content: { heading: 'Designed for momentum', columns: 3, items: [
        { icon: 'Zap', title: 'Faster setup', description: 'Start from reusable client-ready workflows.' },
        { icon: 'Eye', title: 'Clear visibility', description: 'See the work, money, and next action together.' },
        { icon: 'Shield', title: 'Reliable delivery', description: 'Keep every handoff traceable and intentional.' },
      ] } },
      { type: 'pricing', name: 'Plans', content: { heading: 'Choose the right starting point', subheading: 'Simple options for growing teams.', plans: [
        { name: 'Starter', price: '$19', period: '/month', features: ['Core CRM', 'Documents', 'Payments'], cta_text: 'Start free', cta_url: '#', highlighted: false },
        { name: 'Business', price: '$49', period: '/month', features: ['Everything in Starter', 'Automations', 'Campaigns'], cta_text: 'Choose Business', cta_url: '#', highlighted: true },
      ] } },
      { type: 'cta', name: 'Final action', content: { heading: 'Ready when your team is', description: 'Move from scattered tools to one deliberate workflow.', button_text: 'Get started', button_url: '#', style: 'primary' } },
    ],
  },
  {
    name: `${PREFIX}Legacy Referral Offer`,
    slug: 'qa-legacy-referral-offer',
    description: 'An archived offer retained for reference.',
    status: 'archived',
    views: 218,
    visitors: 164,
    createdDaysAgo: 120,
    publishedDaysAgo: 110,
    theme: { primaryColor: '#2563EB', secondaryColor: '#1E40AF', backgroundColor: '#FFFFFF', textColor: '#1F2937', fontFamily: 'Inter', headingFont: 'Inter', borderRadius: 8, spacing: 'normal' },
    sections: [
      { type: 'hero', name: 'Referral offer', content: { heading: 'Good work is worth sharing', subheading: 'Introduce a colleague and receive a service credit after their first project.', cta_text: 'Refer a colleague', cta_url: '#', alignment: 'center', height: 'medium' } },
      { type: 'text', name: 'Offer details', content: { heading: 'How the offer worked', body: '<p>Eligible referrals received a consultation and the referring client received a credit after project completion.</p>', alignment: 'left' } },
      { type: 'cta', name: 'Expired action', content: { heading: 'This offer has ended', description: 'The page remains available internally for reference.', button_text: 'Return home', button_url: '#', style: 'secondary' } },
    ],
  },
];

const formSamples = [
  {
    key: 'project-inquiry',
    name: `${PREFIX}Project Inquiry`,
    slug: 'qa-project-inquiry',
    description: 'Qualifies new service opportunities and creates a contact.',
    type: 'form',
    status: 'published',
    submitButtonText: 'Send inquiry',
    successMessage: 'Thanks — your project details are on their way to our team.',
    createContact: true,
    contactTags: ['Website lead', 'Project inquiry'],
    createdDaysAgo: 36,
    fields: [
      { key: 'first_name', type: 'text', label: 'First name', placeholder: 'Jordan', required: true, width: 'half', map: 'first_name', validation: { min_length: 2, max_length: 80 } },
      { key: 'last_name', type: 'text', label: 'Last name', placeholder: 'Lee', required: true, width: 'half', map: 'last_name', validation: { min_length: 2, max_length: 80 } },
      { key: 'email', type: 'email', label: 'Work email', placeholder: 'jordan@company.com', required: true, width: 'half', map: 'email' },
      { key: 'company', type: 'text', label: 'Company', placeholder: 'Northstar Studio', required: true, width: 'half', map: 'company', validation: { max_length: 120 } },
      { key: 'service', type: 'select', label: 'What can we help with?', required: true, options: ['Website redesign', 'Campaign strategy', 'Client operations', 'Something else'] },
      { key: 'budget', type: 'radio', label: 'Estimated budget', required: true, options: ['Under $5,000', '$5,000–$15,000', '$15,000–$30,000', '$30,000+'] },
      { key: 'timeline', type: 'select', label: 'Ideal start', required: false, width: 'half', options: ['As soon as possible', 'Within 30 days', 'This quarter', 'Still exploring'] },
      { key: 'details', type: 'textarea', label: 'Project details', placeholder: 'What are you trying to improve?', required: true, validation: { min_length: 20, max_length: 1500 } },
      { key: 'consent', type: 'checkbox', label: 'I agree to be contacted about this request', required: true, options: [] },
    ],
    submissions: [
      { daysAgo: 2, values: { first_name: 'Priya', last_name: 'Shah', email: 'priya.shah@example.test', company: 'Meridian Health', service: 'Website redesign', budget: '$15,000–$30,000', timeline: 'Within 30 days', details: 'We need to simplify a multi-location website and make service inquiries easier to route.', consent: true } },
      { daysAgo: 5, values: { first_name: 'Jordan', last_name: 'Lee', email: 'jordan.lee@example.test', company: 'Brightline Consulting', service: 'Client operations', budget: '$5,000–$15,000', timeline: 'This quarter', details: 'Our sales-to-delivery handoff is inconsistent and we want one repeatable client workflow.', consent: true } },
      { daysAgo: 9, values: { first_name: 'Avery', last_name: 'Morgan', email: 'avery.morgan@example.test', company: 'Northstar Studio', service: 'Campaign strategy', budget: 'Under $5,000', timeline: 'Still exploring', details: 'We want a practical launch campaign and a cleaner way to measure recipient engagement.', consent: true } },
    ],
  },
  {
    key: 'client-satisfaction',
    name: `${PREFIX}Client Satisfaction Survey`,
    slug: 'qa-client-satisfaction',
    description: 'Measures project experience and gathers actionable feedback.',
    type: 'survey',
    status: 'published',
    submitButtonText: 'Share feedback',
    successMessage: 'Thank you — your feedback helps us improve the experience.',
    createContact: false,
    contactTags: [],
    createdDaysAgo: 29,
    fields: [
      { key: 'rating', type: 'rating', label: 'How would you rate your overall experience?', required: true, validation: { min: 1, max: 5 } },
      { key: 'nps', type: 'nps', label: 'How likely are you to recommend us?', required: true, validation: { min: 0, max: 10 } },
      { key: 'strength', type: 'select', label: 'What worked especially well?', required: true, options: ['Communication', 'Quality', 'Speed', 'Strategy', 'Project management'] },
      { key: 'improve', type: 'textarea', label: 'What could we improve?', placeholder: 'A specific example is most helpful.', required: false, validation: { max_length: 1200 } },
      { key: 'follow_up', type: 'checkbox', label: 'I am open to a follow-up conversation', required: false, options: [] },
    ],
    submissions: [
      { daysAgo: 1, score: 10, values: { rating: 5, nps: 10, strength: 'Communication', improve: 'Keep the concise weekly decision notes — they made approvals much easier.', follow_up: true } },
      { daysAgo: 4, score: 8, values: { rating: 4, nps: 8, strength: 'Quality', improve: 'A clearer preview of the final handoff package would help.', follow_up: true } },
      { daysAgo: 11, score: 9, values: { rating: 5, nps: 9, strength: 'Project management', improve: 'No major changes. The milestone structure worked well.', follow_up: false } },
      { daysAgo: 18, score: 7, values: { rating: 4, nps: 7, strength: 'Strategy', improve: 'We would have liked one more stakeholder workshop early in the process.', follow_up: true } },
    ],
  },
  {
    key: 'workshop-registration',
    name: `${PREFIX}Workshop Registration`,
    slug: 'qa-workshop-registration',
    description: 'Collects attendee details for an upcoming client workshop.',
    type: 'form',
    status: 'published',
    submitButtonText: 'Reserve my seat',
    successMessage: 'You are registered. Watch your inbox for workshop details.',
    createContact: true,
    contactTags: ['Workshop guest'],
    createdDaysAgo: 18,
    fields: [
      { key: 'name', type: 'text', label: 'Full name', placeholder: 'Taylor Kim', required: true, map: 'first_name', validation: { min_length: 2, max_length: 120 } },
      { key: 'email', type: 'email', label: 'Email', placeholder: 'taylor@company.com', required: true, map: 'email' },
      { key: 'company', type: 'text', label: 'Company', required: false, map: 'company', width: 'half' },
      { key: 'attendance', type: 'radio', label: 'Attendance', required: true, width: 'half', options: ['In person', 'Virtual'] },
      { key: 'accessibility', type: 'textarea', label: 'Accessibility or dietary needs', required: false, validation: { max_length: 500 } },
    ],
    submissions: [
      { daysAgo: 2, values: { name: 'Taylor Kim', email: 'taylor.kim@example.test', company: 'Atlas Works', attendance: 'In person', accessibility: 'Vegetarian lunch, please.' } },
      { daysAgo: 3, values: { name: 'Morgan Chen', email: 'morgan.chen@example.test', company: 'Cedar Labs', attendance: 'Virtual', accessibility: '' } },
      { daysAgo: 6, values: { name: 'Sam Rivera', email: 'sam.rivera@example.test', company: 'Fieldstone Co.', attendance: 'In person', accessibility: 'No accommodations needed.' } },
    ],
  },
  {
    key: 'roi-readiness',
    name: `${PREFIX}ROI Readiness Quiz`,
    slug: 'qa-roi-readiness-quiz',
    description: 'A draft qualification quiz used to test scoring fields.',
    type: 'quiz',
    status: 'draft',
    submitButtonText: 'See my result',
    successMessage: 'Your answers have been recorded.',
    createContact: false,
    contactTags: [],
    createdDaysAgo: 6,
    fields: [
      { key: 'team_size', type: 'select', label: 'How large is your client-facing team?', required: true, options: ['1–5', '6–15', '16–50', '51+'] },
      { key: 'handoffs', type: 'radio', label: 'How consistent are your handoffs?', required: true, options: ['Ad hoc', 'Partly documented', 'Mostly repeatable', 'Fully standardized'] },
      { key: 'hours', type: 'number', label: 'Hours spent on manual coordination each week', required: true, validation: { min: 0, max: 168 } },
      { key: 'goal', type: 'textarea', label: 'What would a better workflow unlock?', required: false, validation: { max_length: 800 } },
    ],
    submissions: [],
  },
  {
    key: 'legacy-contact',
    name: `${PREFIX}Legacy Contact Request`,
    slug: 'qa-legacy-contact-request',
    description: 'An archived form retained to validate historical submissions.',
    type: 'form',
    status: 'archived',
    submitButtonText: 'Contact us',
    successMessage: 'Thanks. We will be in touch.',
    createContact: true,
    contactTags: ['Legacy website lead'],
    createdDaysAgo: 140,
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true, map: 'first_name' },
      { key: 'email', type: 'email', label: 'Email', required: true, map: 'email' },
      { key: 'message', type: 'textarea', label: 'How can we help?', required: true, validation: { min_length: 10, max_length: 1000 } },
    ],
    submissions: [
      { daysAgo: 112, values: { name: 'Casey Brooks', email: 'casey.brooks@example.test', message: 'I would like to discuss a website refresh for our regional team.' } },
      { daysAgo: 118, values: { name: 'Riley Patel', email: 'riley.patel@example.test', message: 'Please send information about your consulting packages.' } },
    ],
  },
];

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT users.id AS user_id, users.email, organizations.id AS organization_id,
            organizations.name AS organization_name, organizations.plan,
            organizations.landing_pages_limit, organizations.forms_limit
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
    `SELECT id FROM contacts WHERE organization_id=$1 ORDER BY created_at,id LIMIT 20`,
    [organizationId],
  )).rows;
}

async function sampleCounts(client, organizationId) {
  const pages = await client.query(
    `SELECT COUNT(*)::int AS count FROM pages WHERE organization_id=$1 AND settings->>'seed'=$2`,
    [organizationId, SEED],
  );
  const forms = await client.query(
    `SELECT COUNT(*)::int AS count FROM forms WHERE organization_id=$1 AND theme->>'seed'=$2`,
    [organizationId, SEED],
  );
  const submissions = await client.query(
    `SELECT COUNT(*)::int AS count FROM form_submissions submission JOIN forms form ON form.id=submission.form_id WHERE form.organization_id=$1 AND form.theme->>'seed'=$2`,
    [organizationId, SEED],
  );
  return {
    pages: Number(pages.rows[0].count),
    forms: Number(forms.rows[0].count),
    submissions: Number(submissions.rows[0].count),
  };
}

async function removeSamples(client, organizationId) {
  const before = await sampleCounts(client, organizationId);
  await client.query(`DELETE FROM pages WHERE organization_id=$1 AND settings->>'seed'=$2`, [organizationId, SEED]);
  await client.query(`DELETE FROM forms WHERE organization_id=$1 AND theme->>'seed'=$2`, [organizationId, SEED]);
  return before;
}

async function insertForm(client, target, sample, index, contacts) {
  const createdAt = daysAgo(sample.createdDaysAgo);
  const theme = { primaryColor: '#2563EB', sample: true, seed: SEED };
  const form = await client.query(
    `INSERT INTO forms (
       organization_id,name,description,slug,type,status,submit_button_text,
       success_message,redirect_url,notify_on_submit,notification_emails,
       theme,create_contact,contact_tags,created_by,created_at,updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,NULL,TRUE,$9::text[],
       $10::jsonb,$11,$12::text[],$13,$14,$15
     ) RETURNING id,public_id`,
    [target.organization_id, sample.name, sample.description, sample.slug, sample.type,
      sample.status, sample.submitButtonText, sample.successMessage, [OWNER_EMAIL],
      JSON.stringify(theme), sample.createContact, sample.contactTags, target.user_id,
      createdAt, daysAgo(Math.min(sample.createdDaysAgo, index + 1))],
  );
  const formId = Number(form.rows[0].id);
  const fieldIds = new Map();
  for (const [fieldIndex, field] of sample.fields.entries()) {
    const inserted = await client.query(
      `INSERT INTO form_fields (
         form_id,field_type,label,placeholder,help_text,is_required,validation,
         options,field_order,width,conditions,map_to_contact_field,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,'[]'::jsonb,$11,$12)
       RETURNING id`,
      [formId, field.type, field.label, field.placeholder || null, field.helpText || null,
        Boolean(field.required), JSON.stringify(field.validation || {}), JSON.stringify(field.options || []),
        fieldIndex, field.width || 'full', field.map || null, createdAt],
    );
    fieldIds.set(field.key, Number(inserted.rows[0].id));
  }

  for (const submission of sample.submissions) {
    const data = {};
    for (const [key, value] of Object.entries(submission.values)) {
      const fieldId = fieldIds.get(key);
      if (fieldId && value !== '') data[String(fieldId)] = value;
    }
    const contact = contacts[(index + sample.submissions.indexOf(submission)) % Math.max(contacts.length, 1)];
    await client.query(
      `INSERT INTO form_submissions (
         form_id,organization_id,contact_id,data,ip_address,user_agent,referrer,score,created_at
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)`,
      [formId, target.organization_id, contact ? Number(contact.id) : null, JSON.stringify(data),
        `203.0.113.${20 + index}`, 'Itemize QA Browser', 'https://example.test/sample-campaign',
        submission.score ?? null, daysAgo(submission.daysAgo)],
    );
  }
  return { id: formId, publicId: form.rows[0].public_id, fieldIds };
}

async function insertPage(client, target, sample, index, formIds) {
  const createdAt = daysAgo(sample.createdDaysAgo);
  const publishedAt = sample.status === 'published' && sample.publishedDaysAgo !== undefined
    ? daysAgo(sample.publishedDaysAgo)
    : null;
  const settings = { showNavbar: false, showFooter: false, enableAnalytics: true, password: null, expiresAt: null, sample: true, seed: SEED };
  const page = await client.query(
    `INSERT INTO pages (
       organization_id,name,description,slug,status,seo_title,seo_description,
       seo_keywords,theme,settings,view_count,unique_visitors,published_at,
       created_by,created_at,updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9::jsonb,$10::jsonb,$11,$12,$13,
       $14,$15,$16
     ) RETURNING id`,
    [target.organization_id, sample.name, sample.description, sample.slug, sample.status,
      sample.seoTitle || sample.name.replace(PREFIX, ''), sample.seoDescription || sample.description,
      'itemize, sample, qa', JSON.stringify(sample.theme), JSON.stringify(settings),
      sample.views, sample.visitors, publishedAt, target.user_id, createdAt,
      daysAgo(Math.min(sample.createdDaysAgo, index + 1))],
  );
  const pageId = Number(page.rows[0].id);
  const sections = [];
  for (const [sectionIndex, section] of sample.sections.entries()) {
    const content = { ...section.content };
    if (section.formKey) content.form_id = formIds.get(section.formKey)?.publicId || null;
    const sectionSettings = section.settings || pageSectionSettings();
    await client.query(
      `INSERT INTO page_sections (
         page_id,organization_id,section_type,name,content,settings,section_order,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
      [pageId, target.organization_id, section.type, section.name, JSON.stringify(content),
        JSON.stringify(sectionSettings), sectionIndex, createdAt, daysAgo(Math.min(sample.createdDaysAgo, index + 1))],
    );
    sections.push({ section_type: section.type, name: section.name, content, settings: sectionSettings });
  }

  const snapshot = {
    name: sample.name,
    description: sample.description,
    slug: sample.slug,
    status: sample.status,
    seo_title: sample.seoTitle || sample.name.replace(PREFIX, ''),
    seo_description: sample.seoDescription || sample.description,
    seo_keywords: 'itemize, sample, qa',
    og_image: null,
    favicon_url: null,
    theme: sample.theme,
    custom_css: null,
    custom_js: null,
    custom_head: null,
    settings,
    sections,
  };
  const version = await client.query(
    `INSERT INTO page_versions (
       page_id,version_number,content,description,created_by,published_at,is_current,created_at
     ) VALUES ($1,1,$2::jsonb,$3,$4,$5,TRUE,$6) RETURNING id`,
    [pageId, JSON.stringify(snapshot), sample.status === 'published' ? 'Published sample' : 'Initial sample',
      target.user_id, publishedAt, daysAgo(Math.max(0, sample.createdDaysAgo - 1))],
  );
  await client.query('UPDATE pages SET current_version_id=$1 WHERE id=$2', [Number(version.rows[0].id), pageId]);
  return pageId;
}

async function seed(client, target, contacts) {
  await client.query('BEGIN');
  try {
    await removeSamples(client, target.organization_id);
    const formIds = new Map();
    for (const [index, sample] of formSamples.entries()) {
      formIds.set(sample.key, await insertForm(client, target, sample, index, contacts));
    }
    for (const [index, sample] of pageSamples.entries()) {
      await insertPage(client, target, sample, index, formIds);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function summary(client, organizationId) {
  const pages = await client.query(
    `SELECT status,COUNT(*)::int AS count,SUM(view_count)::int AS views
     FROM pages WHERE organization_id=$1 AND settings->>'seed'=$2
     GROUP BY status ORDER BY status`,
    [organizationId, SEED],
  );
  const forms = await client.query(
    `SELECT form.status,COUNT(*)::int AS count,
            SUM((SELECT COUNT(*) FROM form_submissions submission WHERE submission.form_id=form.id))::int AS submissions
     FROM forms form WHERE organization_id=$1 AND theme->>'seed'=$2
     GROUP BY form.status ORDER BY form.status`,
    [organizationId, SEED],
  );
  return { pages: pages.rows, forms: forms.rows };
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
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
        plan: target.plan,
        landingPagesLimit: Number(target.landing_pages_limit),
        formsLimit: Number(target.forms_limit),
      },
      availableContacts: contacts.length,
      existing: await sampleCounts(client, target.organization_id),
      planned: DRY_RUN || APPLY
        ? { pages: pageSamples.length, forms: formSamples.length, submissions: formSamples.reduce((total, form) => total + form.submissions.length, 0) }
        : { pages: 0, forms: 0, submissions: 0 },
    }, null, 2));
    if (DRY_RUN) return;

    if (CLEANUP) {
      await client.query('BEGIN');
      try {
        const removed = await removeSamples(client, target.organization_id);
        await client.query('COMMIT');
        console.log(JSON.stringify({ removed }, null, 2));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      return;
    }

    await seed(client, target, contacts);
    console.log(JSON.stringify({ seeded: await summary(client, target.organization_id) }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
