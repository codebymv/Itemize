import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Organization selector GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let emptyUserId: number;
  let adminUserId: number;
  let invitedUserId: number;
  let memberToken: string;
  let outsiderToken: string;
  let emptyUserToken: string;
  let adminUserToken: string;
  let invitedUserToken: string;
  let alphaId: number;
  let betaId: number;
  let outsiderOrganizationId: number;
  let adminEmail: string;
  let invitedEmail: string;
  let outsiderEmail: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_DATABASE_URL is required for organization selector tests',
      );
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    adminEmail = `workspace-admin-${suffix}@test.itemize`;
    invitedEmail = `workspace-invitee-${suffix}@test.itemize`;
    outsiderEmail = `workspace-outsider-${suffix}@test.itemize`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Workspace Member', 'email', true),
              ($2, 'Workspace Outsider', 'email', true),
              ($3, 'Workspace Empty', 'email', true),
              ($4, 'Workspace Admin', 'email', true),
              ($5, 'Workspace Invitee', 'email', true)
       RETURNING id`,
      [
        `workspace-member-${suffix}@test.itemize`,
        outsiderEmail,
        `workspace-empty-${suffix}@test.itemize`,
        adminEmail,
        invitedEmail,
      ],
    );
    [memberId, outsiderId, emptyUserId, adminUserId, invitedUserId] =
      users.rows.map((row) => Number(row.id));

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, settings)
       VALUES ('Alpha Workspace', $1, '{"marker":"alpha"}'::jsonb),
              ('Beta Workspace', $2, '{"marker":"beta"}'::jsonb),
              ('Outsider Workspace', $3, '{}'::jsonb)
       RETURNING id`,
      [
        `workspace-alpha-${suffix}`,
        `workspace-beta-${suffix}`,
        `workspace-outsider-${suffix}`,
      ],
    );
    [alphaId, betaId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );

    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES
         ($1, $4, 'owner', NOW()),
         ($2, $4, 'member', NOW()),
         ($3, $5, 'owner', NOW())`,
      [alphaId, betaId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE
         WHEN id = $1 THEN $2
         WHEN id = $3 THEN $4
         ELSE default_organization_id
       END
       WHERE id = ANY($5::int[])`,
      [
        memberId,
        alphaId,
        outsiderId,
        outsiderOrganizationId,
        [memberId, outsiderId],
      ],
    );

    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    emptyUserToken = await jwt.signAsync(
      { id: emptyUserId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    adminUserToken = await jwt.signAsync(
      { id: adminUserId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    invitedUserToken = await jwt.signAsync(
      { id: invitedUserId },
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

  });

  afterAll(async () => {
    if (pool && (memberId || outsiderId || emptyUserId)) {
      const userIds = [
        memberId,
        outsiderId,
        emptyUserId,
        adminUserId,
        invitedUserId,
      ].filter(Boolean);
      await pool.query(
        `DELETE FROM organizations
         WHERE id IN (
           SELECT organization_id
           FROM organization_members
           WHERE user_id = ANY($1::int[])
         )`,
        [userIds],
      );
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        userIds,
      ]);
    }
    if (app) await app.close();
  });

  const query = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({ query: document, variables });

  const mutation = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'organization-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .send({ query: document, variables });
  };

  const fields =
    'id name slug settings logoUrl role isDefault createdAt updatedAt';

  it('lists only current memberships and identifies the persisted default', async () => {
    const member = await query(
      memberToken,
      `{ organizations { ${fields} } }`,
    ).expect(200);
    const outsider = await query(
      outsiderToken,
      `{ organizations { ${fields} } }`,
    ).expect(200);

    expect(member.body.errors).toBeUndefined();
    expect(member.body.data.organizations).toHaveLength(2);
    expect(member.body.data.organizations).toEqual([
      expect.objectContaining({
        id: alphaId,
        role: 'owner',
        isDefault: true,
        settings: { marker: 'alpha' },
      }),
      expect.objectContaining({
        id: betaId,
        role: 'member',
        isDefault: false,
        settings: { marker: 'beta' },
      }),
    ]);
    expect(outsider.body.data.organizations).toEqual([
      expect.objectContaining({
        id: outsiderOrganizationId,
        role: 'owner',
        isDefault: true,
      }),
    ]);
  });

  it('selects only a current membership and remains readable through GraphQL', async () => {
    const selected = await mutation(
      memberToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { ${fields} }
      }`,
      { id: betaId },
    ).expect(200);
    expect(selected.body.errors).toBeUndefined();
    expect(selected.body.data.selectOrganization).toMatchObject({
      id: betaId,
      role: 'member',
      isDefault: true,
    });

    const readback = await query(
      memberToken,
      `{ organizations { id isDefault } }`,
    ).expect(200);
    expect(
      readback.body.data.organizations.find(
        (organization: { id: number }) => organization.id === betaId,
      ),
    ).toMatchObject({ isDefault: true });

    const forbidden = await mutation(
      outsiderToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { id }
      }`,
      { id: alphaId },
    ).expect(200);
    expect(forbidden.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('requires CSRF for selection without altering the stored default', async () => {
    const denied = await query(
      memberToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { id }
      }`,
      { id: alphaId },
    ).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const persisted = await pool.query<{ default_organization_id: number }>(
      'SELECT default_organization_id FROM users WHERE id = $1',
      [memberId],
    );
    expect(Number(persisted.rows[0].default_organization_id)).toBe(betaId);
  });

  it('serializes concurrent default creation into one personal workspace', async () => {
    const document = `mutation {
      ensureDefaultOrganization { ${fields} }
    }`;
    const [first, second] = await Promise.all([
      mutation(emptyUserToken, document).expect(200),
      mutation(emptyUserToken, document).expect(200),
    ]);

    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.ensureDefaultOrganization.id).toBe(
      second.body.data.ensureDefaultOrganization.id,
    );
    expect(first.body.data.ensureDefaultOrganization).toMatchObject({
      role: 'owner',
      isDefault: true,
      settings: { personal: true },
    });

    const persisted = await pool.query<{
      membership_count: string;
      organization_count: string;
      default_organization_id: number;
    }>(
      `SELECT
         COUNT(om.id)::text AS membership_count,
         COUNT(DISTINCT om.organization_id)::text AS organization_count,
         MAX(u.default_organization_id) AS default_organization_id
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
       WHERE u.id = $1`,
      [emptyUserId],
    );
    expect(persisted.rows[0]).toMatchObject({
      membership_count: '1',
      organization_count: '1',
    });
    expect(Number(persisted.rows[0].default_organization_id)).toBe(
      first.body.data.ensureDefaultOrganization.id,
    );
  });

  it('owns organization CRUD, member administration, leave, and evidence-safe deletion', async () => {
    const created = await mutation(
      memberToken,
      `mutation Create($input: CreateOrganizationInput!) {
        createOrganization(input: $input) { ${fields} }
      }`,
      { input: { name: 'GraphQL Workspace', settings: { tier: 'test' } } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    const organizationId = Number(created.body.data.createOrganization.id);
    expect(created.body.data.createOrganization).toMatchObject({
      name: 'GraphQL Workspace',
      role: 'owner',
      settings: { tier: 'test' },
    });
    await pool.query(
      `UPDATE organizations
       SET plan = 'starter', subscription_status = 'active', users_limit = 3
       WHERE id = $1`,
      [organizationId],
    );

    const detail = await query(
      memberToken,
      `query Detail($id: Int!) { organization(id: $id) { ${fields} } }`,
      { id: organizationId },
    ).expect(200);
    expect(detail.body.data.organization.id).toBe(organizationId);
    const concealed = await query(
      outsiderToken,
      `query Detail($id: Int!) { organization(id: $id) { id } }`,
      { id: organizationId },
    ).expect(200);
    expect(concealed.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const updated = await mutation(
      memberToken,
      `mutation Update($id: Int!, $input: UpdateOrganizationInput!) {
        updateOrganization(id: $id, input: $input) { ${fields} }
      }`,
      {
        id: organizationId,
        input: {
          name: 'GraphQL Workspace Renamed',
          settings: { tier: 'updated' },
          logoUrl: 'https://cdn.test/workspace.png',
        },
      },
    ).expect(200);
    expect(updated.body.data.updateOrganization).toMatchObject({
      name: 'GraphQL Workspace Renamed',
      settings: { tier: 'updated' },
      logoUrl: 'https://cdn.test/workspace.png',
    });

    const memberFields =
      'id organizationId userId role invitedAt joinedAt invitedBy userName email';
    const admin = await mutation(
      memberToken,
      `mutation Add($organizationId: Int!, $input: AddOrganizationMemberInput!) {
        addOrganizationMember(organizationId: $organizationId, input: $input) {
          ${memberFields}
        }
      }`,
      { organizationId, input: { email: adminEmail, role: 'admin' } },
    ).expect(200);
    expect(admin.body.errors).toBeUndefined();
    const adminMemberId = Number(admin.body.data.addOrganizationMember.id);

    const invited = await mutation(
      memberToken,
      `mutation Add($organizationId: Int!, $input: AddOrganizationMemberInput!) {
        addOrganizationMember(organizationId: $organizationId, input: $input) {
          ${memberFields}
        }
      }`,
      { organizationId, input: { email: invitedEmail, role: 'member' } },
    ).expect(200);
    const invitedMemberId = Number(invited.body.data.addOrganizationMember.id);

    const originalMembership = await pool.query<{ id: number }>(
      `SELECT id FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, memberId],
    );
    const ownerMemberId = Number(originalMembership.rows[0].id);

    const adminTransferDenied = await mutation(
      adminUserToken,
      `mutation Transfer($organizationId: Int!, $memberId: Int!) {
        transferOrganizationOwnership(
          organizationId: $organizationId
          memberId: $memberId
        ) { id }
      }`,
      { organizationId, memberId: invitedMemberId },
    ).expect(200);
    expect(adminTransferDenied.body.errors[0].extensions.reason).toBe(
      'OWNER_REQUIRED',
    );

    const transferred = await mutation(
      memberToken,
      `mutation Transfer($organizationId: Int!, $memberId: Int!) {
        transferOrganizationOwnership(
          organizationId: $organizationId
          memberId: $memberId
        ) { ${memberFields} }
      }`,
      { organizationId, memberId: invitedMemberId },
    ).expect(200);
    expect(transferred.body.errors).toBeUndefined();
    expect(transferred.body.data.transferOrganizationOwnership).toMatchObject({
      id: invitedMemberId,
      role: 'owner',
    });
    const ownershipRoles = await pool.query<{ user_id: number; role: string }>(
      `SELECT user_id, role FROM organization_members
       WHERE organization_id = $1
       ORDER BY user_id`,
      [organizationId],
    );
    expect(ownershipRoles.rows.filter((row) => row.role === 'owner')).toEqual([
      expect.objectContaining({ user_id: invitedUserId }),
    ]);
    expect(ownershipRoles.rows).toContainEqual(
      expect.objectContaining({ user_id: memberId, role: 'admin' }),
    );
    await expect(
      pool.query(
        `UPDATE organization_members SET role = 'owner'
         WHERE id = $1`,
        [ownerMemberId],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const restored = await mutation(
      invitedUserToken,
      `mutation Transfer($organizationId: Int!, $memberId: Int!) {
        transferOrganizationOwnership(
          organizationId: $organizationId
          memberId: $memberId
        ) { id role }
      }`,
      { organizationId, memberId: ownerMemberId },
    ).expect(200);
    expect(restored.body.data.transferOrganizationOwnership).toMatchObject({
      id: ownerMemberId,
      role: 'owner',
    });

    const limitReached = await mutation(
      memberToken,
      `mutation Add($organizationId: Int!, $input: AddOrganizationMemberInput!) {
        addOrganizationMember(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId, input: { email: outsiderEmail, role: 'member' } },
    ).expect(200);
    expect(limitReached.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
      current: 3,
      limit: 3,
      plan: 'starter',
    });

    const duplicate = await mutation(
      memberToken,
      `mutation Add($organizationId: Int!, $input: AddOrganizationMemberInput!) {
        addOrganizationMember(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId, input: { email: invitedEmail, role: 'member' } },
    ).expect(200);
    expect(duplicate.body.errors[0].extensions.reason).toBe('ALREADY_MEMBER');

    const listed = await query(
      invitedUserToken,
      `query Members($organizationId: Int!) {
        organizationMembers(organizationId: $organizationId) { ${memberFields} }
      }`,
      { organizationId },
    ).expect(200);
    expect(listed.body.data.organizationMembers).toHaveLength(3);

    const roleChanged = await mutation(
      memberToken,
      `mutation Role($organizationId: Int!, $memberId: Int!, $role: String!) {
        updateOrganizationMemberRole(
          organizationId: $organizationId
          memberId: $memberId
          role: $role
        ) { ${memberFields} }
      }`,
      { organizationId, memberId: invitedMemberId, role: 'viewer' },
    ).expect(200);
    expect(roleChanged.body.data.updateOrganizationMemberRole.role).toBe(
      'viewer',
    );

    const adminPeerDenied = await mutation(
      adminUserToken,
      `mutation Role($organizationId: Int!, $memberId: Int!, $role: String!) {
        updateOrganizationMemberRole(
          organizationId: $organizationId
          memberId: $memberId
          role: $role
        ) { id }
      }`,
      { organizationId, memberId: adminMemberId, role: 'member' },
    ).expect(200);
    expect(adminPeerDenied.body.errors[0].extensions.reason).toBe(
      'ADMIN_PEER_FORBIDDEN',
    );

    const selected = await mutation(
      invitedUserToken,
      `mutation Select($id: Int!) { selectOrganization(id: $id) { id } }`,
      { id: organizationId },
    ).expect(200);
    expect(selected.body.errors).toBeUndefined();
    const left = await mutation(
      invitedUserToken,
      `mutation Leave($organizationId: Int!) {
        leaveOrganization(organizationId: $organizationId)
      }`,
      { organizationId },
    ).expect(200);
    expect(left.body.data.leaveOrganization).toBe(true);
    expect(
      (
        await pool.query<{ default_organization_id: number | null }>(
          'SELECT default_organization_id FROM users WHERE id = $1',
          [invitedUserId],
        )
      ).rows[0].default_organization_id,
    ).toBeNull();

    const readded = await mutation(
      memberToken,
      `mutation Add($organizationId: Int!, $input: AddOrganizationMemberInput!) {
        addOrganizationMember(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId, input: { email: invitedEmail, role: 'member' } },
    ).expect(200);
    const readdedMemberId = Number(readded.body.data.addOrganizationMember.id);
    const removed = await mutation(
      memberToken,
      `mutation Remove($organizationId: Int!, $memberId: Int!) {
        removeOrganizationMember(
          organizationId: $organizationId
          memberId: $memberId
        ) { removedMemberId }
      }`,
      { organizationId, memberId: readdedMemberId },
    ).expect(200);
    expect(removed.body.data.removeOrganizationMember.removedMemberId).toBe(
      readdedMemberId,
    );

    const document = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents (
         organization_id, title, status, file_url, file_name, file_type,
         file_size, original_sha256, created_by
       ) VALUES ($1, 'Retained evidence', 'sent', $2, 'source.pdf',
         'application/pdf', 128, $3, $4)
       RETURNING id`,
      [
        organizationId,
        '/uploads/signatures/graphql-organization-source.pdf',
        'b'.repeat(64),
        memberId,
      ],
    );
    const deniedDelete = await mutation(
      memberToken,
      `mutation Delete($id: Int!) {
        deleteOrganization(id: $id) { deletedId }
      }`,
      { id: organizationId },
    ).expect(200);
    expect(deniedDelete.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'SIGNATURE_EVIDENCE_RETAINED',
    });

    await pool.query(
      `UPDATE signature_documents SET status = 'draft' WHERE id = $1`,
      [document.rows[0].id],
    );
    const deleted = await mutation(
      memberToken,
      `mutation Delete($id: Int!) {
        deleteOrganization(id: $id) { deletedId }
      }`,
      { id: organizationId },
    ).expect(200);
    expect(deleted.body.data.deleteOrganization.deletedId).toBe(
      organizationId,
    );
    const cleanup = await pool.query<{ file_url: string }>(
      `SELECT file_url FROM signature_file_deletion_jobs
       WHERE organization_id = $1`,
      [organizationId],
    );
    expect(cleanup.rows).toEqual([
      { file_url: '/uploads/signatures/graphql-organization-source.pdf' },
    ]);
    await pool.query(
      'DELETE FROM signature_file_deletion_jobs WHERE organization_id = $1',
      [organizationId],
    );
  });

  it('reserves seats and accepts, resends, and revokes secure email invitations', async () => {
    await pool.query(
      `UPDATE organizations
       SET plan = 'starter', subscription_status = 'active', users_limit = 2
       WHERE id = $1`,
      [alphaId],
    );
    const invitationFields = `
      id organizationId organizationName email role status invitedAt expiresAt
      lastSentAt deliverySent
    `;
    const created = await mutation(
      memberToken,
      `mutation Invite($organizationId: Int!, $input: CreateOrganizationInvitationInput!) {
        createOrganizationInvitation(organizationId: $organizationId, input: $input) {
          ${invitationFields}
        }
      }`,
      { organizationId: alphaId, input: { email: invitedEmail, role: 'member' } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createOrganizationInvitation).toMatchObject({
      organizationId: alphaId,
      organizationName: 'Alpha Workspace',
      email: invitedEmail,
      role: 'member',
      status: 'pending',
      deliverySent: false,
    });
    const invitationId = Number(created.body.data.createOrganizationInvitation.id);

    const duplicate = await mutation(
      memberToken,
      `mutation Invite($organizationId: Int!, $input: CreateOrganizationInvitationInput!) {
        createOrganizationInvitation(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId: alphaId, input: { email: invitedEmail, role: 'viewer' } },
    ).expect(200);
    expect(duplicate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVITATION_ALREADY_PENDING',
    });

    const reservedLimit = await mutation(
      memberToken,
      `mutation Invite($organizationId: Int!, $input: CreateOrganizationInvitationInput!) {
        createOrganizationInvitation(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId: alphaId, input: { email: 'another-invitee@test.itemize', role: 'member' } },
    ).expect(200);
    expect(reservedLimit.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
      current: 2,
      limit: 2,
    });

    const beforeResend = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM organization_invitations WHERE id = $1',
      [invitationId],
    );
    const resent = await mutation(
      memberToken,
      `mutation Resend($organizationId: Int!, $invitationId: Int!) {
        resendOrganizationInvitation(
          organizationId: $organizationId
          invitationId: $invitationId
        ) { id status deliverySent }
      }`,
      { organizationId: alphaId, invitationId },
    ).expect(200);
    expect(resent.body.errors).toBeUndefined();
    expect(resent.body.data.resendOrganizationInvitation).toMatchObject({
      id: invitationId,
      status: 'pending',
      deliverySent: false,
    });
    const afterResend = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM organization_invitations WHERE id = $1',
      [invitationId],
    );
    expect(afterResend.rows[0].token_hash).not.toBe(beforeResend.rows[0].token_hash);

    const acceptanceToken = 'a'.repeat(64);
    await pool.query(
      'UPDATE organization_invitations SET token_hash = $1 WHERE id = $2',
      [createHash('sha256').update(acceptanceToken).digest('hex'), invitationId],
    );
    const preview = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query Preview($token: String!) {
          organizationInvitationPreview(token: $token) {
            organizationName email role status expiresAt
          }
        }`,
        variables: { token: acceptanceToken },
      })
      .expect(200);
    expect(preview.body.errors).toBeUndefined();
    expect(preview.body.data.organizationInvitationPreview).toMatchObject({
      organizationName: 'Alpha Workspace',
      email: invitedEmail,
      role: 'member',
      status: 'pending',
    });

    const wrongAccount = await mutation(
      outsiderToken,
      `mutation Accept($token: String!) {
        acceptOrganizationInvitation(token: $token) { organizationId }
      }`,
      { token: acceptanceToken },
    ).expect(200);
    expect(wrongAccount.body.errors[0].extensions.reason).toBe(
      'INVITATION_EMAIL_MISMATCH',
    );

    const accepted = await mutation(
      invitedUserToken,
      `mutation Accept($token: String!) {
        acceptOrganizationInvitation(token: $token) {
          organizationId organizationName role
        }
      }`,
      { token: acceptanceToken },
    ).expect(200);
    expect(accepted.body.errors).toBeUndefined();
    expect(accepted.body.data.acceptOrganizationInvitation).toEqual({
      organizationId: alphaId,
      organizationName: 'Alpha Workspace',
      role: 'member',
    });
    const persisted = await pool.query<{
      role: string;
      default_organization_id: number;
      invitation_status: string;
      token_hash: string | null;
    }>(
      `SELECT member.role, account.default_organization_id,
              invitation.status AS invitation_status, invitation.token_hash
       FROM organization_members member
       JOIN users account ON account.id = member.user_id
       JOIN organization_invitations invitation ON invitation.id = $3
       WHERE member.organization_id = $1 AND member.user_id = $2`,
      [alphaId, invitedUserId, invitationId],
    );
    expect(persisted.rows[0]).toMatchObject({
      role: 'member',
      default_organization_id: alphaId,
      invitation_status: 'accepted',
      token_hash: null,
    });

    await pool.query('UPDATE organizations SET users_limit = 3 WHERE id = $1', [alphaId]);
    const revocable = await mutation(
      memberToken,
      `mutation Invite($organizationId: Int!, $input: CreateOrganizationInvitationInput!) {
        createOrganizationInvitation(organizationId: $organizationId, input: $input) { id }
      }`,
      { organizationId: alphaId, input: { email: 'revoked@test.itemize', role: 'viewer' } },
    ).expect(200);
    const revocableId = Number(revocable.body.data.createOrganizationInvitation.id);
    const revoked = await mutation(
      memberToken,
      `mutation Revoke($organizationId: Int!, $invitationId: Int!) {
        revokeOrganizationInvitation(
          organizationId: $organizationId
          invitationId: $invitationId
        )
      }`,
      { organizationId: alphaId, invitationId: revocableId },
    ).expect(200);
    expect(revoked.body.data.revokeOrganizationInvitation).toBe(true);
    const revokedRow = await pool.query<{ status: string; token_hash: string | null }>(
      'SELECT status, token_hash FROM organization_invitations WHERE id = $1',
      [revocableId],
    );
    expect(revokedRow.rows[0]).toEqual({ status: 'revoked', token_hash: null });
  });
});
