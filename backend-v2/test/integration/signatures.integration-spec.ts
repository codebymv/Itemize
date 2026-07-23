import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { PDFDocument } from 'pdf-lib';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { SignatureCompletionJobsService } from '../../src/public-signing/signature-completion-jobs.service';
import { SignatureDeliveryJobsService } from '../../src/signature-delivery/signature-delivery-jobs.service';
import { signatureDeliveryToken } from '../../src/signature-delivery/signature-delivery.token';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
} from '../../src/signature-files/signature-file-storage.provider';
import {
  WORKFLOW_EMAIL_PROVIDER,
  WorkflowEmailProvider,
} from '../../src/workflow-jobs/workflow-side-effect.providers';

async function signaturePdf(title: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setTitle(title);
  document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

describe('E-signature GraphQL read contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let firstDocumentId: number;
  let secondDocumentId: number;
  let foreignDocumentId: number;
  let templateId: number;
  let foreignTemplateId: number;
  let deliveryJobs: SignatureDeliveryJobsService;
  let completionJobs: SignatureCompletionJobsService;
  const storedSignatureFiles = new Map<string, Buffer>();
  let storedSignatureSequence = 0;
  const signatureStorage = {
    store: jest.fn(async (input: {
      buffer: Buffer;
      organizationId: number;
      resourceId: number;
      scope: string;
    }) => {
      storedSignatureSequence += 1;
      const url = `/uploads/signatures/integration-${input.organizationId}-${input.scope}-${input.resourceId}-${storedSignatureSequence}.pdf`;
      storedSignatureFiles.set(url, Buffer.from(input.buffer));
      return url;
    }),
    read: jest.fn(async (url: string) => storedSignatureFiles.get(url) ?? null),
    remove: jest.fn(async (url: string) => {
      storedSignatureFiles.delete(url);
    }),
  } as jest.Mocked<SignatureFileStorage>;
  const deliveryEmail = {
    send: jest.fn(),
  } as jest.Mocked<WorkflowEmailProvider>;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for e-signature tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Signature Member', 'email', true),
              ($2, 'Signature Outsider', 'email', true)
       RETURNING id`,
      [
        `signature-member-${suffix}@test.itemize`,
        `signature-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, plan)
       VALUES ('Signature Primary', $1, 'starter'),
              ('Signature Other', $2, 'starter')
       RETURNING id`,
      [`signature-primary-${suffix}`, `signature-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id = CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id = ANY($5::int[])`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId, [memberId, outsiderId]],
    );

    const documents = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents (
         organization_id,title,document_number,description,message,file_url,file_name,
         file_size,file_type,status,expiration_days,sender_name,sender_email,
         signed_file_url,original_sha256,signed_sha256,routing_mode,created_by,
         created_at,updated_at
       ) VALUES
         ($1,'Earlier NDA','SIG-1','First','Please sign','private/original-1.pdf',
          'nda-1.pdf',1200,'application/pdf','draft',30,'Member','member@test.itemize',
          NULL,'original-secret-1',NULL,'parallel',$3,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
         ($1,'Later NDA','SIG-2',NULL,NULL,NULL,NULL,NULL,NULL,'draft',14,NULL,NULL,
          NULL,'original-secret-2',NULL,'sequential',$3,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'),
         ($2,'Foreign NDA','FOREIGN',NULL,NULL,'private/foreign.pdf','foreign.pdf',500,
          'application/pdf','draft',30,NULL,NULL,NULL,'foreign-secret',NULL,'parallel',$4,
          '2026-01-03T00:00:00Z','2026-01-03T00:00:00Z')
       RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    [firstDocumentId, secondDocumentId, foreignDocumentId] = documents.rows.map((row) =>
      Number(row.id),
    );

    const recipient = await pool.query<{ id: number }>(
      `INSERT INTO signature_recipients (
         document_id,organization_id,name,email,signing_order,signing_token_hash,
         status,ip_address,user_agent,identity_method,role_name,routing_status
       ) VALUES ($1,$2,'Signer','signer@test.itemize',1,'token-hash-secret','pending',
          '203.0.113.10','secret-user-agent','none','Signer','active')
       RETURNING id`,
      [firstDocumentId, organizationId],
    );
    const recipientId = Number(recipient.rows[0].id);
    await pool.query(
      `INSERT INTO signature_fields (
         document_id,recipient_id,role_name,field_type,page_number,x_position,
         y_position,width,height,label,is_required,value,locked
       ) VALUES ($1,$2,'Signer','signature',1,10,20,30,10,'Sign here',true,NULL,false)`,
      [firstDocumentId, recipientId],
    );
    await pool.query(
      `INSERT INTO signature_audit_log (
         document_id,recipient_id,event_type,description,ip_address,user_agent,metadata,created_at
       ) VALUES ($1,$2,'created','Document created','203.0.113.10','secret-user-agent',
          '{"private":"secret"}'::jsonb,'2026-01-01T00:00:00Z')`,
      [firstDocumentId, recipientId],
    );

    const templates = await pool.query<{ id: number }>(
      `INSERT INTO signature_templates (
         organization_id,title,description,message,file_url,file_name,file_size,file_type,
         original_sha256,created_by,created_at,updated_at
       ) VALUES
         ($1,'Agreement','Reusable','Please sign','private/template.pdf','agreement.pdf',800,
          'application/pdf','template-secret',$3,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
         ($2,'Foreign Agreement',NULL,NULL,NULL,NULL,NULL,NULL,'foreign-template-secret',$4,
          '2026-01-02T00:00:00Z','2026-01-02T00:00:00Z')
       RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    [templateId, foreignTemplateId] = templates.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO signature_template_roles (template_id,role_name,signing_order)
       VALUES ($1,'Signer',1)`,
      [templateId],
    );
    await pool.query(
      `INSERT INTO signature_template_fields (
         template_id,role_name,field_type,page_number,x_position,y_position,width,height,
         label,is_required,locked
       ) VALUES ($1,'Signer','signature',1,10,20,30,10,'Sign here',true,false)`,
      [templateId],
    );

    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(WORKFLOW_EMAIL_PROVIDER)
      .useValue(deliveryEmail)
      .overrideProvider(SIGNATURE_FILE_STORAGE)
      .useValue(signatureStorage)
      .compile();
    deliveryJobs = moduleRef.get(SignatureDeliveryJobsService);
    completionJobs = moduleRef.get(SignatureCompletionJobsService);
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

    const createSignaturesRouter = require('../../../backend/src/routes/signatures.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const passThrough = (_request: unknown, _response: unknown, next: () => void) => next();
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api', createSignaturesRouter(pool, authenticateJWT, passThrough));
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const graphql = (
    token: string,
    orgId: number,
    document: string,
    variables: Record<string, unknown> = {},
  ) => request(app.getHttpServer())
    .post('/graphql')
    .set('Cookie', `itemize_auth=${token}; csrf-token=signature-csrf`)
    .set('x-csrf-token', 'signature-csrf')
    .set('x-organization-id', String(orgId))
    .send({ query: document, variables });

  const legacy = (path: string) => request(legacyApp)
    .get(path)
    .set('Cookie', `itemize_auth=${memberToken}`)
    .set('x-organization-id', String(organizationId));

  const signatureUpload = (path: string, token = memberToken, orgId = organizationId) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', `itemize_auth=${token}; csrf-token=signature-csrf`)
      .set('x-csrf-token', 'signature-csrf')
      .set('x-organization-id', String(orgId));

  const signatureFile = (path: string, token = memberToken, orgId = organizationId) =>
    request(app.getHttpServer())
      .get(path)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));

  const documentFields = `
    id organizationId title documentNumber description message status recipientCount
    routingMode templateId expirationDays expiresAt senderName senderEmail createdById
    sentAt completedAt hasFile hasSignedFile fileName fileType fileSize createdAt updatedAt
  `;

  const createPublicSigningFixture = async (options: {
    recipients?: number;
    routingMode?: 'parallel' | 'sequential';
    includeSharedField?: boolean;
  } = {}) => {
    const recipientCount = options.recipients ?? 1;
    const routingMode = options.routingMode ?? 'parallel';
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([612, 792]);
    const locator =
      `/uploads/signatures/public-${Date.now()}-${storedSignatureSequence + 1}.pdf`;
    storedSignatureFiles.set(locator, Buffer.from(await sourcePdf.save()));
    const document = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents (
         organization_id,title,description,message,file_url,file_name,file_size,file_type,
         status,expiration_days,expires_at,sender_name,sender_email,original_sha256,
         routing_mode,created_by,created_at,updated_at
       ) VALUES (
         $1,'Public signing integration','A public signing test','Please review and sign',
         $2,'public-agreement.pdf',800,'application/pdf','sent',30,
         CURRENT_TIMESTAMP+INTERVAL '30 days','Signature Member',$3,$4,$5,$6,
         '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
       ) RETURNING id`,
      [
        organizationId,
        locator,
        `signature-member@test.itemize`,
        createHash('sha256').update(storedSignatureFiles.get(locator)!).digest('hex'),
        routingMode,
        memberId,
      ],
    );
    const documentId = Number(document.rows[0].id);
    const recipients: Array<{ id: number; token: string | null; fieldId: number }> = [];
    for (let index = 0; index < recipientCount; index += 1) {
      const active = routingMode === 'parallel' || index === 0;
      const token = active
        ? createHash('sha256')
          .update(`public-signing-${documentId}-${index}-${Date.now()}`)
          .digest('base64url')
        : null;
      const inserted = await pool.query<{ id: number }>(
        `INSERT INTO signature_recipients (
           document_id,organization_id,name,email,signing_order,signing_token_hash,
           token_expires_at,status,identity_method,routing_status,sent_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP+INTERVAL '30 days',$7::varchar,'none',$8,
           CASE WHEN $7::varchar='sent' THEN CURRENT_TIMESTAMP ELSE NULL END
         ) RETURNING id`,
        [
          documentId,
          organizationId,
          `Public Signer ${index + 1}`,
          `public-signer-${documentId}-${index + 1}@test.itemize`,
          index + 1,
          token ? createHash('sha256').update(token).digest('hex') : null,
          active ? 'sent' : 'pending',
          active ? 'active' : 'locked',
        ],
      );
      const recipientId = Number(inserted.rows[0].id);
      const field = await pool.query<{ id: number }>(
        `INSERT INTO signature_fields (
           document_id,recipient_id,role_name,field_type,page_number,x_position,
           y_position,width,height,label,is_required,value,locked
         ) VALUES ($1,$2,$3,'text',1,10,$4,40,8,'Full legal name',true,NULL,false)
         RETURNING id`,
        [
          documentId,
          recipientId,
          `Signer ${index + 1}`,
          10 + (index * 12),
        ],
      );
      recipients.push({
        id: recipientId,
        token,
        fieldId: Number(field.rows[0].id),
      });
    }
    let sharedFieldId: number | null = null;
    if (options.includeSharedField) {
      const shared = await pool.query<{ id: number }>(
        `INSERT INTO signature_fields (
           document_id,recipient_id,role_name,field_type,page_number,x_position,
           y_position,width,height,label,is_required,value,locked
         ) VALUES ($1,NULL,NULL,'text',1,10,80,40,8,'Internal prefill',false,
           'server-owned',false)
         RETURNING id`,
        [documentId],
      );
      sharedFieldId = Number(shared.rows[0].id);
    }
    return { documentId, locator, recipients, sharedFieldId };
  };

  it('atomically owns authenticated PDF upload and private delivery boundaries', async () => {
    const firstPdf = await signaturePdf('first draft');
    const uploaded = await signatureUpload('/api/signatures/documents/upload')
      .field('document_id', String(secondDocumentId))
      .attach('file', firstPdf, {
        filename: '../Draft Agreement',
        contentType: 'application/pdf',
      });
    expect({ status: uploaded.status, body: uploaded.body }).toMatchObject({
      status: 200,
      body: {
        success: true,
        data: {
          id: secondDocumentId,
          file_url: `/api/signatures/documents/${secondDocumentId}/file`,
          file_name: 'Draft Agreement.pdf',
          file_type: 'application/pdf',
        },
      },
    });
    expect(uploaded.body.data.original_sha256).toBeUndefined();

    const firstRow = await pool.query<{
      file_url: string;
      original_sha256: string;
    }>(
      `SELECT file_url,original_sha256 FROM signature_documents
       WHERE id=$1 AND organization_id=$2`,
      [secondDocumentId, organizationId],
    );
    const firstUrl = firstRow.rows[0].file_url;
    expect(firstRow.rows[0].original_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSignatureFiles.get(firstUrl)).toEqual(firstPdf);

    const source = await signatureFile(
      `/api/signatures/documents/${secondDocumentId}/file`,
    ).expect(200);
    expect(source.body).toEqual(firstPdf);
    expect(source.headers).toMatchObject({
      'cache-control': 'private, no-store',
      'content-security-policy': 'sandbox',
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
    });
    expect(source.headers['content-disposition']).toContain('inline');

    const secondPdf = await signaturePdf('replacement draft');
    await signatureUpload('/api/signatures/documents/upload')
      .field('document_id', String(secondDocumentId))
      .attach('file', secondPdf, {
        filename: 'Replacement.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    const replacement = await pool.query<{ file_url: string }>(
      'SELECT file_url FROM signature_documents WHERE id=$1',
      [secondDocumentId],
    );
    expect(replacement.rows[0].file_url).not.toBe(firstUrl);
    const cleanup = await pool.query<{ status: string }>(
      `SELECT status FROM signature_file_deletion_jobs
       WHERE organization_id=$1 AND file_url=$2`,
      [organizationId, firstUrl],
    );
    expect(cleanup.rows[0].status).toBe('queued');
    const version = await pool.query<{ file_url: string; total: string }>(
      `SELECT file_url,COUNT(*) OVER () AS total
       FROM signature_document_versions WHERE document_id=$1`,
      [secondDocumentId],
    );
    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]).toMatchObject({
      file_url: replacement.rows[0].file_url,
      total: '1',
    });

    const templatePdf = await signaturePdf('template');
    const uploadTemplateId = Number((await pool.query<{ id: number }>(
      `INSERT INTO signature_templates
         (organization_id,title,description,message,created_by)
       VALUES ($1,'Upload Boundary',NULL,NULL,$2) RETURNING id`,
      [organizationId, memberId],
    )).rows[0].id);
    const templateUpload = await signatureUpload(
      '/api/signatures/templates/upload',
    )
      .field('template_id', String(uploadTemplateId))
      .attach('file', templatePdf, {
        filename: 'Reusable.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    expect(templateUpload.body.data.file_url).toBe(
      `/api/signatures/templates/${uploadTemplateId}/file`,
    );
    await signatureFile(`/api/signatures/templates/${uploadTemplateId}/file`)
      .expect('Content-Type', 'application/pdf')
      .expect(200);
    await pool.query(
      'DELETE FROM signature_templates WHERE id=$1 AND organization_id=$2',
      [uploadTemplateId, organizationId],
    );

    const signedUrl = '/uploads/signatures/integration-completed.pdf';
    const signedPdf = Buffer.from('%PDF-1.7\ncompleted');
    storedSignatureFiles.set(signedUrl, signedPdf);
    await pool.query(
      'UPDATE signature_documents SET signed_file_url=$1 WHERE id=$2',
      [signedUrl, secondDocumentId],
    );
    const completed = await signatureFile(
      `/api/signatures/documents/${secondDocumentId}/download`,
    ).expect(200);
    expect(completed.body).toEqual(signedPdf);
    expect(completed.headers['content-disposition']).toContain('attachment');
  });

  it('fails closed before storage for invalid, foreign, and non-CSRF uploads', async () => {
    const storedBefore = signatureStorage.store.mock.calls.length;
    const foreignDocument = await signatureUpload('/api/signatures/documents/upload')
      .field('document_id', String(foreignDocumentId))
      .attach('file', Buffer.from('%PDF-1.7\nforeign'), {
        filename: 'foreign.pdf',
        contentType: 'application/pdf',
      });
    expect({
      status: foreignDocument.status,
      body: foreignDocument.body,
    }).toMatchObject({ status: 404 });
    await signatureUpload('/api/signatures/templates/upload')
      .field('template_id', String(foreignTemplateId))
      .attach('file', Buffer.from('%PDF-1.7\nforeign'), {
        filename: 'foreign.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);
    await signatureUpload('/api/signatures/documents/upload')
      .field('document_id', String(firstDocumentId))
      .attach('file', Buffer.from('not a pdf'), {
        filename: 'spoof.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/signatures/documents/upload')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .field('document_id', String(firstDocumentId))
      .attach('file', Buffer.from('%PDF-1.7\nno csrf'), {
        filename: 'no-csrf.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    expect(signatureStorage.store).toHaveBeenCalledTimes(storedBefore);

    await signatureFile(
      `/api/signatures/documents/${foreignDocumentId}/file`,
    ).expect(404);
    await signatureFile(
      `/api/signatures/templates/${foreignTemplateId}/file`,
    ).expect(404);
  });

  it('filters and deterministically pages documents with REST parity', async () => {
    const listed = await graphql(
      memberToken,
      organizationId,
      `query List($filter: SignatureDocumentFilterInput, $page: PageInput) {
        signatureDocuments(filter: $filter, page: $page) {
          nodes { ${documentFields} }
          pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
        }
      }`,
      { filter: { status: 'DRAFT' }, page: { page: 1, pageSize: 1 } },
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.signatureDocuments).toMatchObject({
      nodes: [{ id: secondDocumentId, status: 'DRAFT', recipientCount: 0 }],
      pageInfo: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNextPage: true },
    });

    const retained = await legacy('/api/signatures/documents?status=draft&page=1&limit=20')
      .expect(200);
    expect(retained.body.data.items.map((item: { id: number }) => Number(item.id)))
      .toEqual(expect.arrayContaining([firstDocumentId, secondDocumentId]));
    expect(Number(retained.body.data.pagination.total)).toBe(2);
  });

  it('returns one safe aggregate snapshot and keeps retained file delivery URLs private', async () => {
    const detail = await graphql(
      memberToken,
      organizationId,
      `query Detail($id: Int!) {
        signatureDocument(id: $id) {
          document { ${documentFields} }
          recipients { id documentId organizationId email signingOrder roleName routingStatus status identityMethod }
          fields { id documentId recipientId roleName fieldType pageNumber xPosition yPosition width height label isRequired value locked }
          audit { id documentId recipientId eventType description createdAt }
        }
        signatureAuditTrail(id: $id) { id documentId recipientId eventType description createdAt }
      }`,
      { id: firstDocumentId },
    ).expect(200);
    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.signatureDocument).toMatchObject({
      document: {
        id: firstDocumentId,
        status: 'DRAFT',
        recipientCount: 1,
        hasFile: true,
        hasSignedFile: false,
        fileName: 'nda-1.pdf',
      },
      recipients: [{
        documentId: firstDocumentId,
        organizationId,
        email: 'signer@test.itemize',
        roleName: 'Signer',
      }],
      fields: [{ documentId: firstDocumentId, fieldType: 'signature' }],
      audit: [{ documentId: firstDocumentId, eventType: 'created' }],
    });
    expect(detail.body.data.signatureAuditTrail).toEqual(
      detail.body.data.signatureDocument.audit,
    );
    expect(JSON.stringify(detail.body.data)).not.toMatch(
      /token-hash-secret|secret-user-agent|203\.0\.113\.10|original-secret|private\/original/,
    );

    const retained = await legacy(`/api/signatures/documents/${firstDocumentId}`).expect(200);
    expect(Number(retained.body.data.document.id)).toBe(firstDocumentId);
    expect(retained.body.data.recipients).toHaveLength(1);
    expect(retained.body.data.fields).toHaveLength(1);
    expect(retained.body.data.audit).toHaveLength(1);
  });

  it('lists template aggregates and interoperates with retained REST reads', async () => {
    const result = await graphql(
      memberToken,
      organizationId,
      `query Templates($id: Int!) {
        signatureTemplates {
          id organizationId title description message hasFile fileName fileType fileSize
          createdById createdAt updatedAt
        }
        signatureTemplate(id: $id) {
          template { id organizationId title hasFile fileName fileType fileSize createdAt updatedAt }
          roles { id templateId roleName signingOrder }
          fields { id templateId roleName fieldType pageNumber xPosition yPosition width height label isRequired locked }
        }
      }`,
      { id: templateId },
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.signatureTemplates).toHaveLength(1);
    expect(result.body.data.signatureTemplate).toMatchObject({
      template: { id: templateId, organizationId, hasFile: true, fileName: 'agreement.pdf' },
      roles: [{ templateId, roleName: 'Signer', signingOrder: 1 }],
      fields: [{ templateId, roleName: 'Signer', fieldType: 'signature' }],
    });
    expect(JSON.stringify(result.body.data)).not.toMatch(/template-secret|private\/template/);

    const retained = await legacy(`/api/signatures/templates/${templateId}`).expect(200);
    expect(Number(retained.body.data.template.id)).toBe(templateId);
    expect(retained.body.data.roles).toHaveLength(1);
    expect(retained.body.data.fields).toHaveLength(1);
  });

  it('conceals documents and templates owned by another organization', async () => {
    const document = await graphql(
      memberToken,
      organizationId,
      'query Hidden($id: Int!) { signatureDocument(id: $id) { document { id } } }',
      { id: foreignDocumentId },
    ).expect(200);
    expect(document.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const audit = await graphql(
      memberToken,
      organizationId,
      'query Hidden($id: Int!) { signatureAuditTrail(id: $id) { id } }',
      { id: foreignDocumentId },
    ).expect(200);
    expect(audit.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const template = await graphql(
      memberToken,
      organizationId,
      'query Hidden($id: Int!) { signatureTemplate(id: $id) { template { id } } }',
      { id: foreignTemplateId },
    ).expect(200);
    expect(template.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const ownForeign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Own($id: Int!) { signatureDocument(id: $id) { document { id } } }',
      { id: foreignDocumentId },
    ).expect(200);
    expect(ownForeign.body.errors).toBeUndefined();
    expect(ownForeign.body.data.signatureDocument.document.id).toBe(foreignDocumentId);
  });

  it('atomically creates and replaces a draft aggregate with retained REST interoperability', async () => {
    const create = await graphql(memberToken, organizationId, `mutation Create($input:CreateSignatureDocumentInput!){createSignatureDocument(input:$input){${documentFields}}}`, {
      input: {
        title: 'Atomic draft', routingMode: 'sequential', expirationDays: 45,
        recipients: [{ name: 'Signer', email: 'atomic-signer@test.itemize', roleName: 'Signer', signingOrder: 1 }],
        fields: [{ roleName: 'Signer', fieldType: 'signature', pageNumber: 1, xPosition: 10, yPosition: 10, width: 20, height: 10 }],
      },
    }).expect(200);
    expect(create.body.errors).toBeUndefined();
    const id = Number(create.body.data.createSignatureDocument.id);
    expect(create.body.data.createSignatureDocument).toMatchObject({ title: 'Atomic draft', recipientCount: 1, routingMode: 'sequential' });

    const failed = await graphql(memberToken, organizationId, `mutation Update($id:Int!,$input:UpdateSignatureDraftInput!){updateSignatureDraft(id:$id,input:$input){id title}}`, {
      id,
      input: { title: 'Must roll back', fields: [{ roleName: 'Missing role', fieldType: 'text', pageNumber: 1, xPosition: 10, yPosition: 20, width: 20, height: 10 }] },
    }).expect(200);
    expect(failed.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const afterFailure = await pool.query('SELECT title FROM signature_documents WHERE id=$1', [id]);
    const fieldsAfterFailure = await pool.query('SELECT id FROM signature_fields WHERE document_id=$1', [id]);
    expect(afterFailure.rows[0].title).toBe('Atomic draft');
    expect(fieldsAfterFailure.rows).toHaveLength(1);

    const updated = await graphql(memberToken, organizationId, `mutation Update($id:Int!,$input:UpdateSignatureDraftInput!){updateSignatureDraft(id:$id,input:$input){${documentFields}}}`, {
      id,
      input: {
        title: 'Atomic draft updated',
        recipients: [{ name: 'New signer', email: 'new-signer@test.itemize', roleName: 'Signer', signingOrder: 1 }],
        fields: [{ roleName: 'Signer', fieldType: 'date', pageNumber: 2, xPosition: 5, yPosition: 5, width: 15, height: 8 }],
      },
    }).expect(200);
    expect(updated.body.errors).toBeUndefined();
    const retained = await legacy(`/api/signatures/documents/${id}`).expect(200);
    expect(retained.body.data.document.title).toBe('Atomic draft updated');
    expect(retained.body.data.recipients).toMatchObject([{ email: 'new-signer@test.itemize', role_name: 'Signer' }]);
    expect(retained.body.data.fields).toMatchObject([{ field_type: 'date', role_name: 'Signer' }]);

    const deleted = await graphql(memberToken, organizationId, `mutation Delete($id:Int!){deleteSignatureDraft(id:$id){id title}}`, { id }).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteSignatureDraft.id).toBe(id);
    expect((await pool.query('SELECT id FROM signature_documents WHERE id=$1', [id])).rows).toHaveLength(0);
  });

  it('atomically manages templates and snapshots them into editable drafts', async () => {
    const created = await graphql(memberToken, organizationId, `mutation Create($input:CreateSignatureTemplateInput!){createSignatureTemplate(input:$input){id title}}`, {
      input: {
        title: 'Atomic template', description: 'Original',
        roles: [{ roleName: 'Signer', signingOrder: 1 }],
        fields: [{ roleName: 'Signer', fieldType: 'signature', pageNumber: 1, xPosition: 10, yPosition: 10, width: 20, height: 10 }],
      },
    }).expect(200);
    expect(created.body.errors).toBeUndefined();
    const id = Number(created.body.data.createSignatureTemplate.id);

    const failed = await graphql(memberToken, organizationId, `mutation Update($id:Int!,$input:UpdateSignatureTemplateInput!){updateSignatureTemplate(id:$id,input:$input){id title}}`, {
      id, input: { title: 'Must roll back', roles: [{ roleName: 'Other', signingOrder: 1 }] },
    }).expect(200);
    expect(failed.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await pool.query('SELECT title FROM signature_templates WHERE id=$1', [id])).rows[0].title).toBe('Atomic template');

    const instantiated = await graphql(memberToken, organizationId, `mutation Instantiate($id:Int!,$input:InstantiateSignatureTemplateInput!){instantiateSignatureTemplate(id:$id,input:$input){${documentFields}}}`, {
      id, input: { title: 'Template draft', recipients: [{ email: 'template-signer@test.itemize', roleName: 'Signer' }] },
    }).expect(200);
    expect(instantiated.body.errors).toBeUndefined();
    const documentId = Number(instantiated.body.data.instantiateSignatureTemplate.id);
    const snapshot = await legacy(`/api/signatures/documents/${documentId}`).expect(200);
    expect(snapshot.body.data.document).toMatchObject({ title: 'Template draft', template_id: id, status: 'draft' });
    expect(snapshot.body.data.fields[0].recipient_id).toBe(snapshot.body.data.recipients[0].id);

    await graphql(memberToken, organizationId, 'mutation Delete($id:Int!){deleteSignatureDraft(id:$id){id}}', { id: documentId }).expect(200);
    const deletedTemplateUrl = '/uploads/signatures/deleted-template.pdf';
    await pool.query(
      `UPDATE signature_templates SET
         file_url=$1,file_name='deleted-template.pdf',file_size=500,
         file_type='application/pdf'
       WHERE id=$2 AND organization_id=$3`,
      [deletedTemplateUrl, id, organizationId],
    );
    const deleted = await graphql(memberToken, organizationId, 'mutation Delete($id:Int!){deleteSignatureTemplate(id:$id){id title}}', { id }).expect(200);
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data.deleteSignatureTemplate.id).toBe(id);
    expect((await pool.query(
      `SELECT id FROM signature_file_deletion_jobs
       WHERE organization_id=$1 AND document_id IS NULL AND file_url=$2`,
      [organizationId, deletedTemplateUrl],
    )).rows).toHaveLength(1);
  });

  it('cancels atomically and idempotently while previewing escaped server-controlled email HTML', async () => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents
         (organization_id,title,status,created_by,created_at,updated_at)
       VALUES ($1,'Cancellation target','sent',$2,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
              ($1,'Completed target','completed',$2,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
       RETURNING id`,
      [organizationId, memberId],
    );
    const [cancelId, completedId] = inserted.rows.map((row) => Number(row.id));
    const recipient = await pool.query<{ id: number }>(
      `INSERT INTO signature_recipients
         (document_id,organization_id,email,status,signing_token_hash,token_expires_at,routing_status)
       VALUES ($1,$2,'cancel@test.itemize','sent','secret-capability',NOW()+INTERVAL '1 day','active')
       RETURNING id`,
      [cancelId, organizationId],
    );
    await pool.query(
      `INSERT INTO signature_reminders (document_id,recipient_id,scheduled_at,status)
       VALUES ($1,$2,NOW()+INTERVAL '1 day','pending')`,
      [cancelId, recipient.rows[0].id],
    );

    const cancel = () => graphql(
      memberToken,
      organizationId,
      `mutation Cancel($id:Int!){cancelSignatureDocument(id:$id){${documentFields}}}`,
      { id: cancelId },
    );
    const first = await cancel();
    const second = await cancel();
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(second.body.data.cancelSignatureDocument.status).toBe('CANCELLED');
    const state = await pool.query(
      `SELECT d.status,r.signing_token_hash,r.token_expires_at,r.routing_status,
              sr.status AS reminder_status,
              (SELECT COUNT(*) FROM signature_audit_log a
               WHERE a.document_id=d.id AND a.event_type='cancelled') AS cancelled_events
       FROM signature_documents d
       JOIN signature_recipients r ON r.document_id=d.id
       JOIN signature_reminders sr ON sr.document_id=d.id
       WHERE d.id=$1`,
      [cancelId],
    );
    expect(state.rows[0]).toMatchObject({
      status: 'cancelled', signing_token_hash: null, token_expires_at: null,
      routing_status: 'locked', reminder_status: 'cancelled',
    });
    expect(Number(state.rows[0].cancelled_events)).toBe(1);

    const completed = await graphql(
      memberToken,
      organizationId,
      'mutation Cancel($id:Int!){cancelSignatureDocument(id:$id){id status}}',
      { id: completedId },
    );
    expect(completed.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'SIGNATURE_DOCUMENT_COMPLETED',
    });
    expect((await pool.query('SELECT status FROM signature_documents WHERE id=$1', [completedId])).rows[0].status)
      .toBe('completed');

    const hidden = await graphql(
      memberToken,
      organizationId,
      'mutation Cancel($id:Int!){cancelSignatureDocument(id:$id){id}}',
      { id: foreignDocumentId },
    );
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const preview = await graphql(
      memberToken,
      organizationId,
      `query Preview($input:SignatureEmailPreviewInput!){previewSignatureEmail(input:$input){subject html}}`,
      { input: {
        message: 'Please <script>alert(1)</script> sign',
        documentTitle: '<b>NDA</b>',
        senderName: 'Alice & Bob',
        expiresAt: '2026-08-02T06:00:00.000Z',
      } },
    );
    expect(preview.body.errors).toBeUndefined();
    expect(preview.body.data.previewSignatureEmail.subject).toBe('Alice & Bob wants your signature');
    expect(preview.body.data.previewSignatureEmail.html).toContain('Please &lt;script&gt;alert(1)&lt;/script&gt; sign');
    expect(preview.body.data.previewSignatureEmail.html).toContain('/sign/preview');
    expect(preview.body.data.previewSignatureEmail.html).not.toContain('<script>');

    const invalidPreview = await graphql(
      memberToken,
      organizationId,
      'query Preview($input:SignatureEmailPreviewInput!){previewSignatureEmail(input:$input){subject}}',
      { input: { message: '  ' } },
    );
    expect(invalidPreview.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'EMPTY_SIGNATURE_EMAIL_MESSAGE',
    });
  });

  it('removes draft PDF metadata atomically and durably cleans unreferenced owned storage', async () => {
    const sharedUrl = '/uploads/signatures/shared-removal.pdf';
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents
         (organization_id,title,file_url,file_name,file_size,file_type,original_sha256,
          status,created_by,created_at,updated_at)
       VALUES
         ($1,'Removal target',$3,'shared-removal.pdf',600,'application/pdf','hash-one',
          'draft',$2,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
         ($1,'Shared reference',$3,'shared-removal.pdf',600,'application/pdf','hash-two',
          'draft',$2,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
         ($1,'Delete target','/uploads/signatures/delete-draft.pdf','delete-draft.pdf',
          500,'application/pdf','hash-three','draft',$2,
          '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
         ($1,'Sent immutable','/uploads/signatures/sent.pdf','sent.pdf',500,
          'application/pdf','hash-four','sent',$2,
          '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
       RETURNING id`,
      [organizationId, memberId, sharedUrl],
    );
    const [removeId, sharedId, deleteId, sentId] = inserted.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO signature_document_versions
         (document_id,version_number,file_url,file_name,file_size,file_type,original_sha256)
       VALUES ($1,1,$2,'shared-removal.pdf',600,'application/pdf','hash-one')`,
      [removeId, sharedUrl],
    );
    const remove = () => graphql(
      memberToken,
      organizationId,
      `mutation Remove($id:Int!){removeSignatureDraftPdf(id:$id){${documentFields}}}`,
      { id: removeId },
    );
    const first = await remove();
    const repeated = await remove();
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data.removeSignatureDraftPdf).toMatchObject({
      id: removeId,
      status: 'DRAFT',
      hasFile: false,
      hasSignedFile: false,
      fileName: null,
      fileType: null,
      fileSize: null,
    });
    expect(repeated.body.errors).toBeUndefined();
    const state = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM signature_file_deletion_jobs
          WHERE organization_id=$1 AND file_url=$3) AS jobs,
         (SELECT COUNT(*) FROM signature_audit_log
          WHERE document_id=$2 AND event_type='file_removed') AS audits,
         (SELECT COUNT(*) FROM signature_document_versions
          WHERE document_id=$2) AS versions`,
      [organizationId, removeId, sharedUrl],
    );
    expect(Number(state.rows[0].jobs)).toBe(1);
    expect(Number(state.rows[0].audits)).toBe(1);
    expect(Number(state.rows[0].versions)).toBe(0);

    const hidden = await graphql(
      memberToken,
      organizationId,
      'mutation Remove($id:Int!){removeSignatureDraftPdf(id:$id){id}}',
      { id: foreignDocumentId },
    );
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const immutable = await graphql(
      memberToken,
      organizationId,
      'mutation Remove($id:Int!){removeSignatureDraftPdf(id:$id){id}}',
      { id: sentId },
    );
    expect(immutable.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'SIGNATURE_DOCUMENT_NOT_DRAFT',
    });

    const deleted = await graphql(
      memberToken,
      organizationId,
      'mutation Delete($id:Int!){deleteSignatureDraft(id:$id){id}}',
      { id: deleteId },
    );
    expect(deleted.body.errors).toBeUndefined();
    expect((await pool.query(
      `SELECT id FROM signature_file_deletion_jobs
       WHERE organization_id=$1 AND file_url='/uploads/signatures/delete-draft.pdf'`,
      [organizationId],
    )).rows).toHaveLength(1);

    const { SignatureFileCleanupService } = require(
      '../../../backend/src/services/signature-file-cleanup.service',
    );
    const unlink = jest.fn().mockResolvedValue(undefined);
    const cleanup = new SignatureFileCleanupService(pool, {
      unlink,
      getLocalFilePath: (value: string) =>
        value.startsWith('/uploads/signatures/') ? `C:\\safe\\${value.split('/').pop()}` : null,
      s3Service: null,
    });
    const job = await pool.query<{ id: number }>(
      `SELECT id FROM signature_file_deletion_jobs
       WHERE organization_id=$1 AND file_url=$2`,
      [organizationId, sharedUrl],
    );
    await expect(cleanup.run({ jobId: Number(job.rows[0].id) })).resolves.toMatchObject({
      claimed: 1,
      deferred: 1,
      deleted: 0,
    });
    expect(unlink).not.toHaveBeenCalled();
    await pool.query('UPDATE signature_documents SET file_url=NULL WHERE id=$1', [sharedId]);
    await pool.query(
      `UPDATE signature_file_deletion_jobs SET next_attempt_at=NOW()
       WHERE id=$1`,
      [job.rows[0].id],
    );
    const race = await Promise.all([
      cleanup.run({ jobId: Number(job.rows[0].id) }),
      cleanup.run({ jobId: Number(job.rows[0].id) }),
    ]);
    expect(race.reduce((sum: number, result: { deleted: number }) => sum + result.deleted, 0))
      .toBe(1);
    expect(unlink).toHaveBeenCalledTimes(1);
    expect((await pool.query(
      'SELECT status FROM signature_file_deletion_jobs WHERE id=$1',
      [job.rows[0].id],
    )).rows[0].status).toBe('deleted');
  });

  it('durably sends, reminds, schedules, and cancels without persisting raw signing capabilities', async () => {
    deliveryEmail.send.mockReset().mockResolvedValue({ providerId: 'signature-provider-1' });
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents
         (organization_id,title,message,file_url,file_name,file_size,file_type,status,
          expiration_days,sender_name,sender_email,routing_mode,created_by,created_at,updated_at)
       VALUES ($1,'Durable delivery','Please sign','private/durable.pdf','durable.pdf',800,
          'application/pdf','draft',30,'Member','member@test.itemize','parallel',$2,
          '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
       RETURNING id`,
      [organizationId, memberId],
    );
    const documentId = Number(inserted.rows[0].id);
    const recipient = await pool.query<{ id: number }>(
      `INSERT INTO signature_recipients
         (document_id,organization_id,name,email,signing_order,status,routing_status)
       VALUES ($1,$2,'Durable Signer','durable-signer@test.itemize',1,'pending','active')
       RETURNING id`,
      [documentId, organizationId],
    );
    const recipientId = Number(recipient.rows[0].id);
    const send = () => graphql(
      memberToken,
      organizationId,
      'mutation Send($id:Int!){sendSignatureDocument(id:$id){id status}}',
      { id: documentId },
    );
    const concurrent = await Promise.all([send(), send()]);
    const successes = concurrent.filter((result) => !result.body.errors);
    const conflicts = concurrent.filter((result) => result.body.errors);
    expect(successes).toHaveLength(1);
    expect(successes[0].body.data.sendSignatureDocument).toMatchObject({
      id: documentId,
      status: 'SENT',
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'SIGNATURE_DOCUMENT_NOT_DRAFT',
    });

    const queued = await pool.query<{
      id: number;
      idempotency_key: string;
      payload: Record<string, unknown>;
      signing_token_hash: string;
    }>(
      `SELECT outbox.id,outbox.idempotency_key,outbox.payload,recipient.signing_token_hash
       FROM signature_delivery_outbox outbox
       JOIN signature_recipients recipient ON recipient.id=outbox.recipient_id
       WHERE outbox.document_id=$1 AND outbox.delivery_type='signature_request'`,
      [documentId],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0].signing_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(queued.rows[0].payload)).not.toContain(
      queued.rows[0].signing_token_hash,
    );
    expect(Object.keys(queued.rows[0].payload)).not.toContain('token');

    const workerRace = await Promise.all([
      deliveryJobs.run({ outboxId: queued.rows[0].id }),
      deliveryJobs.run({ outboxId: queued.rows[0].id }),
    ]);
    expect(workerRace.reduce((sum, run) => sum + run.sent, 0)).toBe(1);
    expect(deliveryEmail.send).toHaveBeenCalledTimes(1);
    expect(deliveryEmail.send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: queued.rows[0].idempotency_key,
    }));
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_audit_log
       WHERE document_id=$1 AND event_type='sent'`,
      [documentId],
    )).rows[0].total)).toBe(1);

    const invalidSchedule = await graphql(
      memberToken,
      organizationId,
      'mutation Schedule($id:Int!,$days:Int!){scheduleSignatureReminders(id:$id,days:$days){reminderCount}}',
      { id: documentId, days: 0 },
    );
    expect(invalidSchedule.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_SIGNATURE_REMINDER_DAYS',
    });
    const scheduled = await graphql(
      memberToken,
      organizationId,
      'mutation Schedule($id:Int!,$days:Int!){scheduleSignatureReminders(id:$id,days:$days){reminderCount scheduledAt}}',
      { id: documentId, days: 2 },
    );
    expect(scheduled.body.errors).toBeUndefined();
    expect(scheduled.body.data.scheduleSignatureReminders.reminderCount).toBe(1);
    await pool.query(
      `UPDATE signature_reminders SET scheduled_at=NOW()-INTERVAL '1 second'
       WHERE document_id=$1 AND status='pending'`,
      [documentId],
    );
    deliveryEmail.send.mockResolvedValue({ providerId: 'signature-provider-2' });
    await expect(deliveryJobs.run()).resolves.toMatchObject({
      remindersQueued: 1,
      sent: 1,
    });

    const remind = await graphql(
      memberToken,
      organizationId,
      'mutation Remind($id:Int!){sendSignatureReminder(id:$id){id status}}',
      { id: documentId },
    );
    expect(remind.body.errors).toBeUndefined();
    const pendingReminder = await pool.query<{ id: number }>(
      `SELECT id FROM signature_delivery_outbox
       WHERE document_id=$1 AND delivery_type='signature_reminder' AND status='queued'`,
      [documentId],
    );
    expect(pendingReminder.rows).toHaveLength(1);

    const cancel = await graphql(
      memberToken,
      organizationId,
      'mutation Cancel($id:Int!){cancelSignatureDocument(id:$id){id status}}',
      { id: documentId },
    );
    expect(cancel.body.errors).toBeUndefined();
    expect(cancel.body.data.cancelSignatureDocument.status).toBe('CANCELLED');
    const terminal = await pool.query(
      `SELECT recipient.signing_token_hash,outbox.status
       FROM signature_recipients recipient
       JOIN signature_delivery_outbox outbox ON outbox.id=$2
       WHERE recipient.id=$1`,
      [recipientId, pendingReminder.rows[0].id],
    );
    expect(terminal.rows[0]).toMatchObject({
      signing_token_hash: null,
      status: 'cancelled',
    });
  });

  it('serves one non-leaking signing capability and durably completes its PDF', async () => {
    const fixture = await createPublicSigningFixture({ includeSharedField: true });
    const signer = fixture.recipients[0];
    const token = signer.token!;
    const path = `/api/public/sign/${token}`;

    const opened = await request(app.getHttpServer())
      .get(path)
      .set('x-request-id', 'public-signing-open-1')
      .set('user-agent', 'integration signer');
    expect(opened.status).toBe(200);
    expect(opened.headers).toMatchObject({
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
    });
    expect(opened.body).toMatchObject({
      success: true,
      data: {
        document: {
          id: fixture.documentId,
          title: 'Public signing integration',
          file_url: '/api/public/sign/current/file',
          file_name: 'public-agreement.pdf',
        },
        recipient: {
          id: signer.id,
          status: 'viewed',
          identity_method: 'none',
        },
        fields: [{ id: signer.fieldId, field_type: 'text' }],
      },
    });
    expect(JSON.stringify(opened.body)).not.toContain(fixture.locator);
    expect(opened.body.data.fields).toHaveLength(1);
    expect(opened.body.data.fields.map((field: { id: number }) => field.id))
      .not.toContain(fixture.sharedFieldId);

    await request(app.getHttpServer()).get(path).expect(200);
    const inline = await request(app.getHttpServer())
      .get(`${path}/file`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(inline.status).toBe(200);
    expect(inline.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="public-agreement.pdf"',
      'content-security-policy': 'sandbox',
    });
    expect(Buffer.isBuffer(inline.body)).toBe(true);
    const attachment = await request(app.getHttpServer())
      .get(`${path}/download`)
      .expect('Content-Disposition', 'attachment; filename="public-agreement.pdf"')
      .expect(200);
    expect(attachment.headers['content-type']).toBe('application/pdf');
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_audit_log
       WHERE document_id=$1 AND recipient_id=$2 AND event_type='viewed'`,
      [fixture.documentId, signer.id],
    )).rows[0].total)).toBe(1);

    const invalidToken = 'z'.repeat(43);
    const invalid = await request(app.getHttpServer())
      .get(`/api/public/sign/${invalidToken}`);
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual({
      success: false,
      error: {
        message: 'Signing link is invalid or expired',
        code: 'NOT_FOUND',
      },
    });
    await request(app.getHttpServer())
      .post(`${path}/verify`)
      .send({})
      .expect(410);

    const rejected = await request(app.getHttpServer())
      .post(path)
      .send({ fields: [{ id: fixture.sharedFieldId, value: 'overwrite' }] });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        reason: 'UNKNOWN_SIGNATURE_FIELD',
      },
    });
    const rolledBack = await pool.query(
      `SELECT recipient.signing_token_hash,field.value
       FROM signature_recipients recipient
       JOIN signature_fields field ON field.id=$2
       WHERE recipient.id=$1`,
      [signer.id, signer.fieldId],
    );
    expect(rolledBack.rows[0].signing_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rolledBack.rows[0].value).toBeNull();

    const signed = await request(app.getHttpServer())
      .post(path)
      .set('x-request-id', 'public-signing-submit-1')
      .send({ fields: [{ id: signer.fieldId, value: 'Public Signer One' }] });
    expect(signed.status).toBe(200);
    expect(signed.body).toMatchObject({
      success: true,
      data: {
        documentId: fixture.documentId,
        recipientId: signer.id,
        completionQueued: true,
      },
    });
    await request(app.getHttpServer()).post(path).send({
      fields: [{ id: signer.fieldId, value: 'Replay' }],
    }).expect(404);

    const queued = await pool.query<{ id: number }>(
      `SELECT id FROM signature_completion_jobs
       WHERE document_id=$1 AND status='queued'`,
      [fixture.documentId],
    );
    expect(queued.rows).toHaveLength(1);
    await expect(completionJobs.run({ jobId: queued.rows[0].id })).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
    });
    const completed = await pool.query<{
      status: string;
      signed_file_url: string;
      signed_sha256: string;
    }>(
      `SELECT status,signed_file_url,signed_sha256
       FROM signature_documents WHERE id=$1`,
      [fixture.documentId],
    );
    expect(completed.rows[0]).toMatchObject({
      status: 'completed',
      signed_file_url: expect.stringMatching(/^\/uploads\/signatures\//),
      signed_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const completedBytes = storedSignatureFiles.get(completed.rows[0].signed_file_url);
    expect(completedBytes?.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect((await PDFDocument.load(completedBytes!)).getPageCount()).toBe(2);
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_delivery_outbox
       WHERE document_id=$1 AND delivery_type='document_completed'`,
      [fixture.documentId],
    )).rows[0].total)).toBe(2);
  });

  it('activates sequential signers once and decline revokes the document', async () => {
    const fixture = await createPublicSigningFixture({
      recipients: 2,
      routingMode: 'sequential',
    });
    const first = fixture.recipients[0];
    const second = fixture.recipients[1];
    await request(app.getHttpServer())
      .post(`/api/public/sign/${first.token}`)
      .send({ fields: [{ id: first.fieldId, value: 'First Signer' }] })
      .expect(200);

    const key =
      `signature-request-sequential-v1-${fixture.documentId}-${second.id}`
      + `-after-${first.id}`;
    const secondToken = signatureDeliveryToken(key);
    const activated = await pool.query(
      `SELECT status,routing_status,signing_token_hash
       FROM signature_recipients WHERE id=$1`,
      [second.id],
    );
    expect(activated.rows[0]).toMatchObject({
      status: 'sent',
      routing_status: 'active',
      signing_token_hash: createHash('sha256').update(secondToken).digest('hex'),
    });
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_delivery_outbox
       WHERE idempotency_key=$1`,
      [key],
    )).rows[0].total)).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/public/sign/${secondToken}`)
      .expect(200);
    const declined = await request(app.getHttpServer())
      .post(`/api/public/sign/${secondToken}/decline`)
      .send({ reason: 'Terms changed' });
    expect(declined.status).toBe(200);
    expect(declined.body).toMatchObject({
      success: true,
      data: { documentId: fixture.documentId, recipientId: second.id },
    });
    expect((await pool.query(
      `SELECT status FROM signature_documents WHERE id=$1`,
      [fixture.documentId],
    )).rows[0].status).toBe('cancelled');
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_recipients
       WHERE document_id=$1 AND signing_token_hash IS NOT NULL`,
      [fixture.documentId],
    )).rows[0].total)).toBe(0);
    expect((await pool.query(
      `SELECT status FROM signature_delivery_outbox WHERE idempotency_key=$1`,
      [key],
    )).rows[0].status).toBe('cancelled');
    await request(app.getHttpServer())
      .get(`/api/public/sign/${secondToken}`)
      .expect(404);
  });

  it('serializes competing public sign and decline terminal actions', async () => {
    const fixture = await createPublicSigningFixture();
    const signer = fixture.recipients[0];
    const path = `/api/public/sign/${signer.token}`;
    const outcomes = await Promise.all([
      request(app.getHttpServer())
        .post(path)
        .send({ fields: [{ id: signer.fieldId, value: 'Race Winner' }] }),
      request(app.getHttpServer())
        .post(`${path}/decline`)
        .send({ reason: 'Race decline' }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 404]);
    const authoritative = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM signature_audit_log
       WHERE document_id=$1 AND event_type IN ('signed','declined')
       ORDER BY id`,
      [fixture.documentId],
    );
    expect(authoritative.rows).toHaveLength(1);
    const document = await pool.query<{ status: string }>(
      'SELECT status FROM signature_documents WHERE id=$1',
      [fixture.documentId],
    );
    expect(document.rows[0].status).toBe(
      authoritative.rows[0].event_type === 'signed' ? 'in_progress' : 'cancelled',
    );
    expect(Number((await pool.query(
      `SELECT COUNT(*) AS total FROM signature_completion_jobs
       WHERE document_id=$1 AND status IN ('queued','processing','completed')`,
      [fixture.documentId],
    )).rows[0].total)).toBe(
      authoritative.rows[0].event_type === 'signed' ? 1 : 0,
    );
  });

  it('serializes starter-plan monthly quota checks under concurrent draft creation', async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) => graphql(
      memberToken,
      organizationId,
      'mutation Create($input:CreateSignatureDocumentInput!){createSignatureDocument(input:$input){id}}',
      { input: { title: `Quota ${index}` } },
    )));
    const successfulIds = attempts.filter((result) => !result.body.errors).map((result) => Number(result.body.data.createSignatureDocument.id));
    const failures = attempts.filter((result) => result.body.errors);
    expect(successfulIds).toHaveLength(5);
    expect(failures).toHaveLength(1);
    expect(failures[0].body.errors[0].extensions).toMatchObject({ code: 'FORBIDDEN', reason: 'SIGNATURE_MONTHLY_LIMIT' });
    await pool.query('DELETE FROM signature_documents WHERE id=ANY($1::int[])', [successfulIds]);
  });
});
