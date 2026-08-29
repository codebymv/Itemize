const { createHash, randomUUID } = require('node:crypto');
let s3Sdk;
try {
  s3Sdk = require('@aws-sdk/client-s3');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  s3Sdk = require('../backend/node_modules/@aws-sdk/client-s3');
}
const { DeleteObjectCommand, PutObjectCommand, S3Client } = s3Sdk;
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const DOCUMENT_NUMBER_PREFIX = 'QA-SEED-20260829-';
const TITLE_PREFIX = 'QA Sample · ';
const DAY_MS = 24 * 60 * 60 * 1000;

const templates = [
  {
    key: 'nda',
    title: 'Mutual NDA',
    description: 'Reusable mutual confidentiality agreement for early client conversations.',
    message: 'Please review the confidentiality terms and sign where indicated.',
    hasFile: true,
    roles: ['Company representative', 'Client'],
  },
  {
    key: 'services',
    title: 'Client Services Agreement',
    description: 'Reusable agreement covering scope, payment terms, and project delivery.',
    message: 'Please review the engagement terms before signing.',
    hasFile: true,
    roles: ['Provider', 'Client'],
  },
  {
    key: 'proposal',
    title: 'Project Proposal',
    description: 'A reusable project proposal with approval and signature fields.',
    message: 'Approve the proposed scope, timeline, and investment below.',
    hasFile: true,
    roles: ['Client'],
  },
  {
    key: 'change-order',
    title: 'Change Order',
    description: 'A reusable scope-change request awaiting its source PDF.',
    message: 'Review and approve the requested change to the active engagement.',
    hasFile: false,
    roles: ['Provider', 'Client'],
  },
  {
    key: 'contractor',
    title: 'Contractor Onboarding',
    description: 'An onboarding packet awaiting its source PDF.',
    message: 'Complete the onboarding details and required acknowledgements.',
    hasFile: false,
    roles: ['Contractor'],
  },
  {
    key: 'dpa',
    title: 'Data Processing Addendum',
    description: 'A privacy addendum awaiting its approved source PDF.',
    message: 'Review the data-handling terms and sign on behalf of your organization.',
    hasFile: false,
    roles: ['Provider', 'Customer'],
  },
];

const documents = [
  {
    title: 'Website Redesign Proposal',
    templateKey: 'proposal',
    status: 'draft',
    daysAgo: 1,
    hasFile: false,
    description: 'Scope, milestones, and investment for the Northstar website redesign.',
    recipients: [
      { name: 'Ava Morgan', email: 'ava@northstar.example', role: 'Client', status: 'pending' },
    ],
  },
  {
    title: 'Master Services Agreement',
    templateKey: 'services',
    status: 'in_progress',
    daysAgo: 2,
    sentDaysAgo: 2,
    hasFile: true,
    description: 'Ongoing creative and implementation services for Northstar Studio.',
    recipients: [
      { name: 'Matthew Valentine', email: 'codebymv@gmail.com', role: 'Provider', status: 'signed', signedDaysAgo: 1 },
      { name: 'Ava Morgan', email: 'ava@northstar.example', role: 'Client', status: 'viewed', viewedDaysAgo: 1 },
    ],
  },
  {
    title: 'Discovery Workshop Approval',
    templateKey: 'proposal',
    status: 'sent',
    daysAgo: 3,
    sentDaysAgo: 2,
    hasFile: true,
    description: 'Approval for the discovery workshop scope and scheduled deliverables.',
    recipients: [
      { name: 'Jordan Lee', email: 'jordan@cascade.example', role: 'Client', status: 'sent' },
    ],
  },
  {
    title: 'Mutual NDA — Harbor Labs',
    templateKey: 'nda',
    status: 'completed',
    daysAgo: 5,
    sentDaysAgo: 4,
    completedDaysAgo: 2,
    hasFile: true,
    hasSignedFile: true,
    description: 'Completed mutual NDA for product strategy discussions with Harbor Labs.',
    recipients: [
      { name: 'Matthew Valentine', email: 'codebymv@gmail.com', role: 'Company representative', status: 'signed', signedDaysAgo: 3 },
      { name: 'Priya Shah', email: 'priya@harborlabs.example', role: 'Client', status: 'signed', signedDaysAgo: 2 },
    ],
  },
  {
    title: 'Vendor Onboarding Packet',
    templateKey: 'contractor',
    status: 'draft',
    daysAgo: 6,
    hasFile: true,
    description: 'Vendor profile, tax information, and operating acknowledgements.',
    recipients: [
      { name: 'Noah Chen', email: 'noah@brightline.example', role: 'Contractor', status: 'pending' },
    ],
  },
  {
    title: 'Change Order 03 — CRM Migration',
    templateKey: 'change-order',
    status: 'in_progress',
    daysAgo: 8,
    sentDaysAgo: 7,
    hasFile: true,
    description: 'Additional data-cleanup and reporting scope for the CRM migration.',
    recipients: [
      { name: 'Matthew Valentine', email: 'codebymv@gmail.com', role: 'Provider', status: 'signed', signedDaysAgo: 6 },
      { name: 'Elena Torres', email: 'elena@fieldstone.example', role: 'Client', status: 'sent' },
    ],
  },
  {
    title: 'Data Processing Addendum — Atlas',
    templateKey: 'dpa',
    status: 'sent',
    daysAgo: 10,
    sentDaysAgo: 9,
    hasFile: true,
    description: 'Data-processing and privacy obligations for the Atlas engagement.',
    recipients: [
      { name: 'Sam Rivera', email: 'sam@atlasworks.example', role: 'Customer', status: 'sent' },
    ],
  },
  {
    title: 'Quarterly Retainer Renewal',
    templateKey: 'services',
    status: 'completed',
    daysAgo: 13,
    sentDaysAgo: 12,
    completedDaysAgo: 9,
    hasFile: true,
    hasSignedFile: true,
    description: 'Completed renewal for quarterly strategy and implementation support.',
    recipients: [
      { name: 'Matthew Valentine', email: 'codebymv@gmail.com', role: 'Provider', status: 'signed', signedDaysAgo: 10 },
      { name: 'Maya Patel', email: 'maya@juniperco.example', role: 'Client', status: 'signed', signedDaysAgo: 9 },
    ],
  },
  {
    title: 'Event Sponsorship Agreement',
    templateKey: 'services',
    status: 'cancelled',
    daysAgo: 18,
    sentDaysAgo: 17,
    hasFile: true,
    description: 'Cancelled sponsorship agreement retained for activity-history testing.',
    recipients: [
      { name: 'Taylor Brooks', email: 'taylor@summit.example', role: 'Client', status: 'declined', declinedDaysAgo: 15 },
    ],
  },
  {
    title: 'Contractor Agreement — Brightline',
    templateKey: 'contractor',
    status: 'expired',
    daysAgo: 45,
    sentDaysAgo: 44,
    expiresDaysAgo: 14,
    hasFile: true,
    description: 'Expired contractor agreement retained for lifecycle-state testing.',
    recipients: [
      { name: 'Noah Chen', email: 'noah@brightline.example', role: 'Contractor', status: 'sent' },
    ],
  },
];

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const futureDays = (days) => new Date(Date.now() + days * DAY_MS);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT users.id AS user_id, users.email,
            organizations.id AS organization_id,
            organizations.name AS organization_name
       FROM users
       JOIN organization_members membership ON membership.user_id = users.id
       JOIN organizations ON organizations.id = membership.organization_id
      WHERE lower(users.email) = lower($1)
      ORDER BY (organizations.id = users.default_organization_id) DESC,
               membership.joined_at, organizations.id
      LIMIT 1`,
    [OWNER_EMAIL],
  );
  if (!result.rows[0]) {
    throw new Error(`No organization membership found for ${OWNER_EMAIL}`);
  }
  return result.rows[0];
}

async function existingSeedCounts(client, target) {
  const [documentResult, templateResult] = await Promise.all([
    client.query(
      `SELECT COUNT(*)::int AS count
         FROM signature_documents
        WHERE organization_id=$1 AND document_number LIKE $2`,
      [target.organization_id, `${DOCUMENT_NUMBER_PREFIX}%`],
    ),
    client.query(
      `SELECT COUNT(*)::int AS count
         FROM signature_templates
        WHERE organization_id=$1 AND created_by=$2 AND title LIKE $3`,
      [target.organization_id, target.user_id, `${TITLE_PREFIX}%`],
    ),
  ]);
  return {
    documents: Number(documentResult.rows[0].count),
    templates: Number(templateResult.rows[0].count),
  };
}

function s3Storage() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Production signature storage credentials are required');
  }
  const bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
  const region = process.env.AWS_REGION || 'us-west-2';
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
  return { bucket, region, client };
}

async function samplePdf(title, subtitle, completed = false) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: rgb(0.08, 0.27, 0.65) });
  page.drawText('ITEMIZE', { x: 44, y: 747, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(title, { x: 44, y: 670, size: 24, font: bold, color: rgb(0.08, 0.12, 0.2) });
  page.drawText(subtitle, { x: 44, y: 640, size: 11, font: regular, color: rgb(0.32, 0.38, 0.48) });
  page.drawText('QA SAMPLE DOCUMENT', { x: 44, y: 590, size: 10, font: bold, color: rgb(0.08, 0.27, 0.65) });
  page.drawText('This generated PDF is intentionally non-binding and exists only for Itemize UI testing.', {
    x: 44, y: 565, size: 10, font: regular, color: rgb(0.22, 0.26, 0.32), maxWidth: 500,
  });
  page.drawLine({ start: { x: 44, y: 170 }, end: { x: 280, y: 170 }, thickness: 1, color: rgb(0.55, 0.6, 0.68) });
  page.drawText(completed ? 'Electronically signed for QA testing' : 'Authorized signature', {
    x: 44, y: 150, size: 10, font: regular, color: completed ? rgb(0.05, 0.55, 0.28) : rgb(0.32, 0.38, 0.48),
  });
  page.drawText(`Generated ${new Date().toISOString().slice(0, 10)}`, {
    x: 44, y: 50, size: 9, font: regular, color: rgb(0.45, 0.5, 0.58),
  });
  pdf.setTitle(title);
  pdf.setSubject('Itemize QA sample document');
  return Buffer.from(await pdf.save());
}

async function uploadPdf(storage, input) {
  const key = `signatures/signature-${input.organizationId}-${input.scope}-${input.resourceId}-${randomUUID()}.pdf`;
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Body: input.buffer,
    ContentType: 'application/pdf',
    ServerSideEncryption: 'AES256',
  }));
  return {
    key,
    url: `https://${storage.bucket}.s3.${storage.region}.amazonaws.com/${key}`,
    name: input.name,
    size: input.buffer.length,
    hash: sha256(input.buffer),
  };
}

function storageKey(storage, fileUrl) {
  if (!fileUrl) return null;
  try {
    const parsed = new URL(fileUrl);
    if (parsed.hostname !== `${storage.bucket}.s3.${storage.region}.amazonaws.com`) return null;
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return key.startsWith('signatures/') ? key : null;
  } catch {
    return null;
  }
}

async function deleteStoredFiles(storage, fileUrls) {
  const keys = [...new Set(fileUrls.map((url) => storageKey(storage, url)).filter(Boolean))];
  for (const key of keys) {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
  }
  return keys.length;
}

async function existingFileUrls(client, target) {
  const result = await client.query(
    `SELECT file_url FROM signature_documents
      WHERE organization_id=$1 AND document_number LIKE $2
     UNION ALL
     SELECT signed_file_url AS file_url FROM signature_documents
      WHERE organization_id=$1 AND document_number LIKE $2
     UNION ALL
     SELECT file_url FROM signature_templates
      WHERE organization_id=$1 AND created_by=$3 AND title LIKE $4`,
    [target.organization_id, `${DOCUMENT_NUMBER_PREFIX}%`, target.user_id, `${TITLE_PREFIX}%`],
  );
  return result.rows.map((row) => row.file_url).filter(Boolean);
}

async function removeSeedRows(client, target) {
  const documentsResult = await client.query(
    `DELETE FROM signature_documents
      WHERE organization_id=$1 AND document_number LIKE $2
      RETURNING id`,
    [target.organization_id, `${DOCUMENT_NUMBER_PREFIX}%`],
  );
  const templatesResult = await client.query(
    `DELETE FROM signature_templates
      WHERE organization_id=$1 AND created_by=$2 AND title LIKE $3
      RETURNING id`,
    [target.organization_id, target.user_id, `${TITLE_PREFIX}%`],
  );
  return { documents: documentsResult.rowCount || 0, templates: templatesResult.rowCount || 0 };
}

async function insertTemplate(client, target, sample, index) {
  const createdAt = daysAgo(templates.length - index + 2);
  const result = await client.query(
    `INSERT INTO signature_templates
       (organization_id,title,description,message,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     RETURNING id`,
    [target.organization_id, `${TITLE_PREFIX}${sample.title}`, sample.description, sample.message, target.user_id, createdAt],
  );
  const templateId = Number(result.rows[0].id);
  for (const [roleIndex, roleName] of sample.roles.entries()) {
    await client.query(
      `INSERT INTO signature_template_roles (template_id,role_name,signing_order)
       VALUES ($1,$2,$3)`,
      [templateId, roleName, roleIndex + 1],
    );
  }
  return templateId;
}

async function attachTemplateFields(client, templateId, roles) {
  for (const [index, roleName] of roles.entries()) {
    await client.query(
      `INSERT INTO signature_template_fields
         (template_id,role_name,field_type,page_number,x_position,y_position,width,height,label,is_required,locked)
       VALUES ($1,$2,'signature',1,$3,$4,38,7,$5,true,false),
              ($1,$2,'date',1,$6,$4,16,5,'Date signed',true,false)`,
      [templateId, roleName, 8 + index * 47, 76 - index * 14, `Signature — ${roleName}`, 48 + index * 47],
    );
  }
}

async function insertDocument(client, target, sample, index, templateId) {
  const createdAt = daysAgo(sample.daysAgo);
  const sentAt = sample.sentDaysAgo == null ? null : daysAgo(sample.sentDaysAgo);
  const completedAt = sample.completedDaysAgo == null ? null : daysAgo(sample.completedDaysAgo);
  const expiresAt = sample.expiresDaysAgo == null
    ? (sentAt ? futureDays(30) : null)
    : daysAgo(sample.expiresDaysAgo);
  const result = await client.query(
    `INSERT INTO signature_documents
       (organization_id,title,document_number,description,message,status,
        expiration_days,expires_at,sender_name,sender_email,sent_at,completed_at,
        timezone,locale,routing_mode,template_id,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,30,$7,$8,$9,$10,$11,
             'America/Phoenix','en-US','parallel',$12,$13,$14,$15)
     RETURNING id`,
    [
      target.organization_id,
      `${TITLE_PREFIX}${sample.title}`,
      `${DOCUMENT_NUMBER_PREFIX}${String(index + 1).padStart(3, '0')}`,
      sample.description,
      'This is sample data for Itemize document workflow testing.',
      sample.status,
      expiresAt,
      'Itemize QA',
      target.email,
      sentAt,
      completedAt,
      templateId,
      target.user_id,
      createdAt,
      completedAt || sentAt || createdAt,
    ],
  );
  const documentId = Number(result.rows[0].id);
  const recipientIds = [];
  for (const [recipientIndex, recipient] of sample.recipients.entries()) {
    const sent = sentAt && recipient.status !== 'pending' ? sentAt : null;
    const viewed = recipient.viewedDaysAgo == null ? null : daysAgo(recipient.viewedDaysAgo);
    const signed = recipient.signedDaysAgo == null ? null : daysAgo(recipient.signedDaysAgo);
    const declined = recipient.declinedDaysAgo == null ? null : daysAgo(recipient.declinedDaysAgo);
    const recipientResult = await client.query(
      `INSERT INTO signature_recipients
         (document_id,organization_id,name,email,signing_order,status,sent_at,viewed_at,
          signed_at,declined_at,decline_reason,identity_method,identity_verified_at,
          role_name,routing_status,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'none',$12,$13,$14,$15)
       RETURNING id`,
      [
        documentId,
        target.organization_id,
        recipient.name,
        recipient.email,
        recipientIndex + 1,
        recipient.status,
        sent,
        viewed,
        signed,
        declined,
        declined ? 'Scope changed before approval' : null,
        signed,
        recipient.role,
        signed ? 'completed' : recipient.status === 'pending' ? 'locked' : 'active',
        createdAt,
      ],
    );
    recipientIds.push(Number(recipientResult.rows[0].id));
  }
  return { documentId, recipientIds, createdAt, sentAt, completedAt };
}

async function attachDocumentFields(client, documentId, recipients, recipientIds) {
  for (const [index, recipient] of recipients.entries()) {
    await client.query(
      `INSERT INTO signature_fields
         (document_id,recipient_id,role_name,field_type,page_number,x_position,y_position,
          width,height,label,is_required,locked)
       VALUES ($1,$2,$3,'signature',1,$4,$5,38,7,$6,true,false),
              ($1,$2,$3,'date',1,$7,$5,16,5,'Date signed',true,false)`,
      [documentId, recipientIds[index], recipient.role, 8 + index * 47, 76 - index * 14, `Signature — ${recipient.role}`, 48 + index * 47],
    );
  }
}

async function attachAuditHistory(client, documentId, sample, recipientIds, createdAt, sentAt, completedAt) {
  await client.query(
    `INSERT INTO signature_audit_log (document_id,event_type,description,metadata,created_at)
     VALUES ($1,'created','Document created for QA workflow testing','{"source":"sample-seed"}'::jsonb,$2)`,
    [documentId, createdAt],
  );
  if (sentAt) {
    await client.query(
      `INSERT INTO signature_audit_log (document_id,event_type,description,metadata,created_at)
       VALUES ($1,'sent','Signature request sent','{"source":"sample-seed"}'::jsonb,$2)`,
      [documentId, sentAt],
    );
  }
  for (const [index, recipient] of sample.recipients.entries()) {
    if (recipient.viewedDaysAgo != null) {
      await client.query(
        `INSERT INTO signature_audit_log (document_id,recipient_id,event_type,description,metadata,created_at)
         VALUES ($1,$2,'viewed','Recipient viewed the document','{"source":"sample-seed"}'::jsonb,$3)`,
        [documentId, recipientIds[index], daysAgo(recipient.viewedDaysAgo)],
      );
    }
    if (recipient.signedDaysAgo != null) {
      await client.query(
        `INSERT INTO signature_audit_log (document_id,recipient_id,event_type,description,metadata,created_at)
         VALUES ($1,$2,'signed','Recipient signed the document','{"source":"sample-seed"}'::jsonb,$3)`,
        [documentId, recipientIds[index], daysAgo(recipient.signedDaysAgo)],
      );
    }
    if (recipient.declinedDaysAgo != null) {
      await client.query(
        `INSERT INTO signature_audit_log (document_id,recipient_id,event_type,description,metadata,created_at)
         VALUES ($1,$2,'declined','Recipient declined the document','{"source":"sample-seed"}'::jsonb,$3)`,
        [documentId, recipientIds[index], daysAgo(recipient.declinedDaysAgo)],
      );
    }
  }
  if (completedAt) {
    await client.query(
      `INSERT INTO signature_audit_log (document_id,event_type,description,metadata,created_at)
       VALUES ($1,'completed','All signatures collected','{"source":"sample-seed"}'::jsonb,$2)`,
      [documentId, completedAt],
    );
  }
}

async function seed(client, target, storage) {
  const uploaded = [];
  const oldFileUrls = await existingFileUrls(client, target);
  await client.query('BEGIN');
  try {
    await removeSeedRows(client, target);
    const templateIds = new Map();
    for (const [index, sample] of templates.entries()) {
      const templateId = await insertTemplate(client, target, sample, index);
      templateIds.set(sample.key, templateId);
      if (sample.hasFile) {
        const buffer = await samplePdf(`${TITLE_PREFIX}${sample.title}`, sample.description);
        const file = await uploadPdf(storage, {
          organizationId: target.organization_id,
          scope: 'template',
          resourceId: templateId,
          name: `${sample.key}-template.pdf`,
          buffer,
        });
        uploaded.push(file.url);
        await client.query(
          `UPDATE signature_templates
              SET file_url=$1,file_name=$2,file_size=$3,file_type='application/pdf',
                  original_sha256=$4,updated_at=CURRENT_TIMESTAMP
            WHERE id=$5`,
          [file.url, file.name, file.size, file.hash, templateId],
        );
        await attachTemplateFields(client, templateId, sample.roles);
      }
    }

    for (const [index, sample] of documents.entries()) {
      const inserted = await insertDocument(client, target, sample, index, templateIds.get(sample.templateKey));
      if (sample.hasFile) {
        const buffer = await samplePdf(`${TITLE_PREFIX}${sample.title}`, sample.description);
        const file = await uploadPdf(storage, {
          organizationId: target.organization_id,
          scope: 'document',
          resourceId: inserted.documentId,
          name: `${String(index + 1).padStart(2, '0')}-${sample.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`,
          buffer,
        });
        uploaded.push(file.url);
        let signedFile = null;
        if (sample.hasSignedFile) {
          const signedBuffer = await samplePdf(`${TITLE_PREFIX}${sample.title}`, 'Completed electronic signature copy', true);
          signedFile = await uploadPdf(storage, {
            organizationId: target.organization_id,
            scope: 'document',
            resourceId: inserted.documentId,
            name: `${String(index + 1).padStart(2, '0')}-signed.pdf`,
            buffer: signedBuffer,
          });
          uploaded.push(signedFile.url);
        }
        await client.query(
          `UPDATE signature_documents
              SET file_url=$1,file_name=$2,file_size=$3,file_type='application/pdf',
                  original_sha256=$4,signed_file_url=$5,signed_sha256=$6
            WHERE id=$7`,
          [file.url, file.name, file.size, file.hash, signedFile?.url || null, signedFile?.hash || null, inserted.documentId],
        );
        await attachDocumentFields(client, inserted.documentId, sample.recipients, inserted.recipientIds);
      }
      await attachAuditHistory(
        client,
        inserted.documentId,
        sample,
        inserted.recipientIds,
        inserted.createdAt,
        inserted.sentAt,
        inserted.completedAt,
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await deleteStoredFiles(storage, uploaded).catch(() => undefined);
    throw error;
  }
  await deleteStoredFiles(storage, oldFileUrls);
}

async function cleanup(client, target, storage) {
  const fileUrls = await existingFileUrls(client, target);
  await client.query('BEGIN');
  try {
    const removed = await removeSeedRows(client, target);
    await client.query('COMMIT');
    return { ...removed, files: await deleteStoredFiles(storage, fileUrls) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function seedSummary(client, target) {
  const [documentResult, templateResult] = await Promise.all([
    client.query(
      `SELECT status,COUNT(*)::int AS count
         FROM signature_documents
        WHERE organization_id=$1 AND document_number LIKE $2
        GROUP BY status ORDER BY status`,
      [target.organization_id, `${DOCUMENT_NUMBER_PREFIX}%`],
    ),
    client.query(
      `SELECT (file_url IS NOT NULL) AS ready,COUNT(*)::int AS count
         FROM signature_templates
        WHERE organization_id=$1 AND created_by=$2 AND title LIKE $3
        GROUP BY ready ORDER BY ready DESC`,
      [target.organization_id, target.user_id, `${TITLE_PREFIX}%`],
    ),
  ]);
  return {
    documents: documentResult.rows,
    templates: templateResult.rows.map((row) => ({ readiness: row.ready ? 'ready' : 'needs_file', count: row.count })),
  };
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
    const existing = await existingSeedCounts(client, target);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
      },
      existing,
      planned: DRY_RUN || APPLY ? { documents: documents.length, templates: templates.length } : { documents: 0, templates: 0 },
    }, null, 2));
    if (DRY_RUN) return;

    const storage = s3Storage();
    if (CLEANUP) {
      console.log(JSON.stringify({ removed: await cleanup(client, target, storage) }, null, 2));
      return;
    }
    await seed(client, target, storage);
    console.log(JSON.stringify({ seeded: await seedSummary(client, target) }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
