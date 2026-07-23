import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

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
      .compile();
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
    .set('Cookie', `itemize_auth=${token}`)
    .set('x-organization-id', String(orgId))
    .send({ query: document, variables });

  const legacy = (path: string) => request(legacyApp)
    .get(path)
    .set('Cookie', `itemize_auth=${memberToken}`)
    .set('x-organization-id', String(organizationId));

  const documentFields = `
    id organizationId title documentNumber description message status recipientCount
    routingMode templateId expirationDays expiresAt senderName senderEmail createdById
    sentAt completedAt hasFile hasSignedFile fileName fileType fileSize createdAt updatedAt
  `;

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
});
