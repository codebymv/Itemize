import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthEmailService } from '../../src/auth/auth-email.service';
import { AccountDeletionSchedulerService } from '../../src/auth/account-deletion-scheduler.service';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Authentication lifecycle GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const emails = {
    sendVerification: jest.fn().mockResolvedValue(true),
    sendWelcome: jest.fn().mockResolvedValue(true),
    sendPasswordReset: jest.fn().mockResolvedValue(true),
    sendPasswordChanged: jest.fn().mockResolvedValue(true),
    sendAccountDeleted: jest.fn().mockResolvedValue(true),
    sendAccountDeletionScheduled: jest.fn().mockResolvedValue(true),
    sendAccountDeletionRecovered: jest.fn().mockResolvedValue(true),
    sendAccountDeletionCanceled: jest.fn().mockResolvedValue(true),
  };
  const createdUserIds: number[] = [];
  const suffix = `${Date.now()}-${process.pid}`;
  const primaryEmail = `auth-lifecycle-${suffix}@test.itemize`;
  const resendEmail = `auth-resend-${suffix}@test.itemize`;
  let verificationToken = '';

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.NODE_ENV = 'test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(AuthEmailService)
      .useValue(emails)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (pool && createdUserIds.length > 0) {
      await pool.query(
        `DELETE FROM organizations
         WHERE id IN (
           SELECT organization_id FROM organization_members
           WHERE user_id = ANY($1::int[])
         )`,
        [createdUserIds],
      );
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);
    }
    if (app) await app.close();
  });

  const mutation = (document: string, variables: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/graphql').send({ query: document, variables });

  it('atomically creates the user, personal workspace, owner membership, and default', async () => {
    const response = await mutation(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { success message email }
      }`,
      { input: { email: primaryEmail, password: 'StrongPass1', name: 'Lifecycle Member' } },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.register).toMatchObject({
      success: true,
      email: primaryEmail,
    });
    expect(emails.sendVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: primaryEmail }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      undefined,
    );
    verificationToken = emails.sendVerification.mock.calls[0][1];

    const persisted = await pool.query<{
      id: number;
      password_hash: string;
      verification_token: string;
      membership_count: string;
      organization_count: string;
      default_organization_id: number;
      owned_organization_id: number;
    }>(
      `SELECT u.id, u.password_hash, u.verification_token,
              COUNT(om.id)::text AS membership_count,
              COUNT(DISTINCT om.organization_id)::text AS organization_count,
              MAX(u.default_organization_id) AS default_organization_id,
              MAX(om.organization_id) FILTER (WHERE om.role = 'owner') AS owned_organization_id
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
       WHERE u.email = $1
       GROUP BY u.id`,
      [primaryEmail],
    );
    const row = persisted.rows[0];
    createdUserIds.push(Number(row.id));
    expect(row).toMatchObject({ membership_count: '1', organization_count: '1' });
    expect(Number(row.default_organization_id)).toBe(Number(row.owned_organization_id));
    expect(row.verification_token).not.toBe(verificationToken);
    await expect(bcrypt.compare('StrongPass1', row.password_hash)).resolves.toBe(true);
  });

  it('allows only one concurrent verification winner and establishes its cookie session', async () => {
    const document = `mutation Verify($input: VerifyEmailInput!) {
      verifyEmail(input: $input) { success user { uid email name role } }
    }`;
    const [first, second] = await Promise.all([
      mutation(document, { input: { token: verificationToken } }).expect(200),
      mutation(document, { input: { token: verificationToken } }).expect(200),
    ]);
    const responses = [first, second];
    const winners = responses.filter((response) => response.body.data?.verifyEmail?.success);
    const losers = responses.filter((response) => response.body.errors?.length);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].body.errors[0].extensions.code).toBe('INVALID_TOKEN');
    const cookies = winners[0].headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('itemize_auth='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('itemize_refresh='))).toBe(true);
    expect(emails.sendWelcome).toHaveBeenCalledTimes(1);

    const persisted = await pool.query<{
      email_verified: boolean;
      verification_token: string | null;
    }>('SELECT email_verified, verification_token FROM users WHERE email = $1', [primaryEmail]);
    expect(persisted.rows[0]).toEqual({ email_verified: true, verification_token: null });
  });

  it('keeps resend non-enumerating and rotates only an eligible account token', async () => {
    emails.sendVerification.mockClear();
    const document = `mutation Resend($input: ResendVerificationInput!) {
      resendVerificationEmail(input: $input) { success message email }
    }`;
    const missing = await mutation(document, {
      input: { email: `missing-${suffix}@test.itemize` },
    }).expect(200);
    const verified = await mutation(document, { input: { email: primaryEmail } }).expect(200);
    expect(missing.body).toEqual(verified.body);
    expect(emails.sendVerification).not.toHaveBeenCalled();

    await mutation(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { success email }
      }`,
      { input: { email: resendEmail, password: 'StrongPass2', name: 'Resend Member' } },
    ).expect(200);
    const created = await pool.query<{ id: number; verification_token: string }>(
      'SELECT id, verification_token FROM users WHERE email = $1',
      [resendEmail],
    );
    createdUserIds.push(Number(created.rows[0].id));
    const originalHash = created.rows[0].verification_token;
    emails.sendVerification.mockClear();

    const eligible = await mutation(document, { input: { email: resendEmail } }).expect(200);
    expect(eligible.body).toEqual(missing.body);
    expect(emails.sendVerification).toHaveBeenCalledTimes(1);
    const rotated = await pool.query<{ verification_token: string }>(
      'SELECT verification_token FROM users WHERE email = $1',
      [resendEmail],
    );
    expect(rotated.rows[0].verification_token).not.toBe(originalHash);
  });

  it('keeps recovery non-enumerating and permits one concurrent reset winner', async () => {
    emails.sendPasswordReset.mockClear();
    emails.sendPasswordChanged.mockClear();
    const requestDocument = `mutation RequestReset($input: RequestPasswordResetInput!) {
      requestPasswordReset(input: $input) { success message email }
    }`;
    const missing = await mutation(requestDocument, {
      input: { email: `missing-reset-${suffix}@test.itemize` },
    }).expect(200);
    const eligible = await mutation(requestDocument, {
      input: { email: resendEmail },
    }).expect(200);

    expect(eligible.body).toEqual(missing.body);
    expect(emails.sendPasswordReset).toHaveBeenCalledTimes(1);
    const rawToken = emails.sendPasswordReset.mock.calls[0][1];
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const before = await pool.query<{ password_reset_token: string }>(
      'SELECT password_reset_token FROM users WHERE email = $1',
      [resendEmail],
    );
    expect(before.rows[0].password_reset_token).not.toBe(rawToken);

    const resetDocument = `mutation Reset($input: ResetPasswordInput!) {
      resetPassword(input: $input) { success message }
    }`;
    const responses = await Promise.all([
      mutation(resetDocument, {
        input: { token: rawToken, password: 'RecoveredPass3' },
      }).expect(200),
      mutation(resetDocument, {
        input: { token: rawToken, password: 'RecoveredPass3' },
      }).expect(200),
    ]);
    expect(responses.filter((response) => response.body.data?.resetPassword?.success)).toHaveLength(1);
    expect(responses.filter((response) => response.body.errors?.[0]?.extensions?.code === 'INVALID_TOKEN')).toHaveLength(1);
    expect(emails.sendPasswordChanged).toHaveBeenCalledTimes(1);
    const after = await pool.query<{
      password_hash: string;
      password_reset_token: string | null;
    }>('SELECT password_hash, password_reset_token FROM users WHERE email = $1', [resendEmail]);
    expect(after.rows[0].password_reset_token).toBeNull();
    await expect(bcrypt.compare('RecoveredPass3', after.rows[0].password_hash)).resolves.toBe(true);
  });

  it('requires authentication and CSRF for password and profile changes', async () => {
    emails.sendPasswordChanged.mockClear();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid } }
        }`,
        variables: { input: { email: primaryEmail, password: 'StrongPass1' } },
      })
      .expect(200);

    const changeDocument = `mutation Change($input: ChangePasswordInput!) {
      changePassword(input: $input) { success message }
    }`;
    const withoutCsrf = await agent
      .post('/graphql')
      .send({
        query: changeDocument,
        variables: { input: { currentPassword: 'StrongPass1', newPassword: 'ChangedPass4' } },
      })
      .expect(200);
    expect(withoutCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const csrf = await agent
      .post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    const csrfToken = csrf.body.data.csrfToken.token as string;
    const changed = await agent
      .post('/graphql')
      .set('x-csrf-token', csrfToken)
      .send({
        query: changeDocument,
        variables: { input: { currentPassword: 'StrongPass1', newPassword: 'ChangedPass4' } },
      })
      .expect(200);
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.changePassword.success).toBe(true);

    const profile = await agent
      .post('/graphql')
      .set('x-csrf-token', csrfToken)
      .send({
        query: `mutation Profile($input: UpdateViewerProfileInput!) {
          updateViewerProfile(input: $input) { id email name }
        }`,
        variables: { input: { name: '  Updated Lifecycle Member  ' } },
      })
      .expect(200);
    expect(profile.body.errors).toBeUndefined();
    expect(profile.body.data.updateViewerProfile).toMatchObject({
      email: primaryEmail,
      name: 'Updated Lifecycle Member',
    });
    expect(emails.sendPasswordChanged).toHaveBeenCalledTimes(1);
    const persisted = await pool.query<{ name: string; password_hash: string }>(
      'SELECT name, password_hash FROM users WHERE email = $1',
      [primaryEmail],
    );
    expect(persisted.rows[0].name).toBe('Updated Lifecycle Member');
    await expect(bcrypt.compare('ChangedPass4', persisted.rows[0].password_hash)).resolves.toBe(true);
  });

  it('exports a portable account snapshot without credentials or sharing capabilities', async () => {
    const identity = await pool.query<{ id: number; default_organization_id: number }>(
      'SELECT id, default_organization_id FROM users WHERE email = $1',
      [primaryEmail],
    );
    const userId = Number(identity.rows[0].id);
    const organizationId = Number(identity.rows[0].default_organization_id);
    await pool.query(
      `INSERT INTO lists (
         user_id, organization_id, title, items, share_token, is_public, shared_at
       ) VALUES ($1, $2, 'Exported list', '[{"text":"Portable"}]'::jsonb,
         '11111111-1111-4111-8111-111111111111', TRUE, NOW())`,
      [userId, organizationId],
    );
    const vault = await pool.query<{ id: number }>(
      `INSERT INTO vaults (
         user_id, title, crypto_version, wrapped_vek, wrapped_vek_recovery,
         master_password_hash, share_token, share_token_hash,
         share_snapshot_ciphertext, share_snapshot_iv
       ) VALUES ($1, 'Exported vault', 2, 'wrapped-vek', 'wrapped-recovery',
         'password-verifier', 'vault-capability', $2, 'shared-snapshot', 'snapshot-iv')
       RETURNING id`,
      [userId, 'a'.repeat(64)],
    );
    await pool.query(
      `INSERT INTO vault_items (
         vault_id, item_type, label, encrypted_value, iv, order_index, crypto_version
       ) VALUES ($1, 'secure_note', 'Encrypted note', 'ciphertext', 'item-iv', 0, 2)`,
      [vault.rows[0].id],
    );

    const anonymous = await mutation(
      `query { viewerDataExport { schemaVersion } }`,
      {},
    ).expect(200);
    expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid } }
        }`,
        variables: { input: { email: primaryEmail, password: 'ChangedPass4' } },
      })
      .expect(200);
    const exported = await agent
      .post('/graphql')
      .send({
        query: `query Export {
          viewerDataExport { schemaVersion generatedAt filename data }
        }`,
      })
      .expect(200);

    expect(exported.body.errors).toBeUndefined();
    expect(exported.body.data.viewerDataExport).toMatchObject({
      schemaVersion: 1,
      filename: expect.stringMatching(/^itemize-account-export-\d{4}-\d{2}-\d{2}\.json$/),
      data: {
        account: { email: primaryEmail, name: 'Updated Lifecycle Member' },
        memberships: [expect.objectContaining({
          organizationId,
          role: 'owner',
          isDefault: true,
        })],
        personalContent: {
          lists: [expect.objectContaining({ title: 'Exported list' })],
          vaults: [expect.objectContaining({
            title: 'Exported vault',
            wrapped_vek: 'wrapped-vek',
            wrapped_vek_recovery: 'wrapped-recovery',
            items: [expect.objectContaining({
              label: 'Encrypted note',
              encrypted_value: 'ciphertext',
            })],
          })],
        },
      },
    });
    const serialized = JSON.stringify(exported.body.data.viewerDataExport.data);
    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('password-verifier');
    expect(serialized).not.toContain('share_token');
    expect(serialized).not.toContain('vault-capability');
    expect(serialized).not.toContain('shared-snapshot');
  });

  it('preflights blockers, schedules recoverably, and purges only after the deadline', async () => {
    const deletionEmail = `auth-delete-${suffix}@test.itemize`;
    const passwordHash = await bcrypt.hash('DeletePass5', 4);
    const created = await pool.query<{ id: number }>(
      `INSERT INTO users (
         email, name, password_hash, provider, email_verified, created_at, updated_at
       ) VALUES ($1, 'Deletion Member', $2, 'email', TRUE, NOW(), NOW())
       RETURNING id`,
      [deletionEmail, passwordHash],
    );
    const userId = Number(created.rows[0].id);
    createdUserIds.push(userId);
    const organization = await pool.query<{ id: number }>(
      `INSERT INTO organizations (
         name, slug, settings, plan, subscription_status, users_limit
       ) VALUES ('Deletion Workspace', $1, '{"personal":true}'::jsonb, 'free', 'none', 1)
       RETURNING id`,
      [`auth-delete-${suffix}`],
    );
    const organizationId = Number(organization.rows[0].id);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW())`,
      [organizationId, userId],
    );
    await pool.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, userId],
    );

    const agent = request.agent(app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation Login($input: LoginInput!) {
        login(input: $input) { success user { uid } }
      }`,
      variables: { input: { email: deletionEmail, password: 'DeletePass5' } },
    }).expect(200);
    const csrf = await agent.post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    const csrfToken = csrf.body.data.csrfToken.token as string;
    const deletionDocument = `mutation Delete($input: DeleteViewerAccountInput!) {
      deleteViewerAccount(input: $input) {
        success message email scheduledAt recoveryDays
      }
    }`;
    const deleteAccount = () => agent.post('/graphql')
      .set('x-csrf-token', csrfToken)
      .send({
        query: deletionDocument,
        variables: {
          input: { confirmation: deletionEmail, currentPassword: 'DeletePass5' },
        },
      })
      .expect(200);

    const other = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Other Member', 'google', TRUE) RETURNING id`,
      [`auth-delete-other-${suffix}@test.itemize`],
    );
    const otherUserId = Number(other.rows[0].id);
    createdUserIds.push(otherUserId);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'member', NOW())`,
      [organizationId, otherUserId],
    );
    const shared = await deleteAccount();
    expect(shared.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'OWNERSHIP_TRANSFER_REQUIRED',
    });
    await pool.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, otherUserId],
    );

    await pool.query(
      `UPDATE organizations
       SET stripe_subscription_id = 'sub_deletion_test', subscription_status = 'active'
       WHERE id = $1`,
      [organizationId],
    );
    const subscribed = await deleteAccount();
    expect(subscribed.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'ACTIVE_SUBSCRIPTION',
    });
    await pool.query(
      `UPDATE organizations
       SET stripe_subscription_id = NULL, subscription_status = 'none'
       WHERE id = $1`,
      [organizationId],
    );

    const document = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents (
         organization_id, title, status, file_url, created_by
       ) VALUES ($1, 'Deletion evidence', 'sent', 'https://files.test/deletion.pdf', $2)
       RETURNING id`,
      [organizationId, userId],
    );
    const retained = await deleteAccount();
    expect(retained.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'SIGNATURE_EVIDENCE_RETAINED',
    });
    await pool.query(
      `UPDATE signature_documents SET status = 'draft' WHERE id = $1`,
      [document.rows[0].id],
    );

    const preflight = await agent.post('/graphql').send({
      query: `query {
        viewerAccountDeletionPreflight {
          eligible recoveryDays membershipCount ownedOrganizationCount
          blockers { reason organizationId organizationName }
          retentionNotices
        }
      }`,
    }).expect(200);
    expect(preflight.body.data.viewerAccountDeletionPreflight).toMatchObject({
      eligible: true,
      recoveryDays: 7,
      membershipCount: 1,
      ownedOrganizationCount: 1,
      blockers: [],
    });

    emails.sendAccountDeletionScheduled.mockClear();
    emails.sendAccountDeletionScheduled.mockResolvedValueOnce(false);
    const rejectedDelivery = await deleteAccount();
    expect(rejectedDelivery.body.errors[0].extensions).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      reason: 'ACCOUNT_RECOVERY_EMAIL_UNAVAILABLE',
    });
    const stillActive = await pool.query(
      `SELECT account_deletion_scheduled_at IS NULL AS active,
              account_deletion_token_hash IS NULL AS no_recovery_token
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(stillActive.rows[0]).toEqual({ active: true, no_recovery_token: true });

    const scheduled = await deleteAccount();
    expect(scheduled.body.errors).toBeUndefined();
    expect(scheduled.body.data.deleteViewerAccount).toMatchObject({
      success: true,
      email: deletionEmail,
      recoveryDays: 7,
      scheduledAt: expect.any(String),
    });
    const cookies = scheduled.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('itemize_auth=;'))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('itemize_refresh=;'))).toBe(true);
    expect(emails.sendAccountDeletionScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ email: deletionEmail }),
      expect.any(String),
      expect.any(Date),
    );

    const locked = await pool.query(
      `SELECT account_deletion_scheduled_at IS NOT NULL AS pending,
              account_deletion_token_hash IS NOT NULL AS has_recovery_token
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(locked.rows[0]).toEqual({ pending: true, has_recovery_token: true });

    const recoveryCalls = emails.sendAccountDeletionScheduled.mock.calls;
    const recoveryToken = recoveryCalls[recoveryCalls.length - 1][1] as string;
    const recovered = await request(app.getHttpServer()).post('/graphql')
      .set('Cookie', `csrf-token=${csrfToken}`)
      .set('x-csrf-token', csrfToken)
      .send({
        query: `mutation Recover($input: RecoverViewerAccountInput!) {
          recoverViewerAccount(input: $input) { success email }
        }`,
        variables: { input: { token: recoveryToken } },
      })
      .expect(200);
    expect(recovered.body.data.recoverViewerAccount).toEqual({
      success: true,
      email: deletionEmail,
    });
    expect(emails.sendAccountDeletionRecovered).toHaveBeenCalledWith(
      expect.objectContaining({ email: deletionEmail }),
    );

    const relogin = request.agent(app.getHttpServer());
    await relogin.post('/graphql').send({
      query: `mutation Login($input: LoginInput!) {
        login(input: $input) { success user { uid } }
      }`,
      variables: { input: { email: deletionEmail, password: 'DeletePass5' } },
    }).expect(200);
    const nextCsrf = await relogin.post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    await relogin.post('/graphql')
      .set('x-csrf-token', nextCsrf.body.data.csrfToken.token)
      .send({
        query: deletionDocument,
        variables: {
          input: { confirmation: deletionEmail, currentPassword: 'DeletePass5' },
        },
      })
      .expect(200);

    await pool.query(
      `UPDATE users SET account_deletion_scheduled_at = NOW() - INTERVAL '1 minute'
       WHERE id = $1`,
      [userId],
    );
    emails.sendAccountDeleted.mockClear();
    await app.get(AccountDeletionSchedulerService).runCycle();
    expect(emails.sendAccountDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ email: deletionEmail }),
    );

    const persisted = await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM users WHERE id = $1) AS user_exists,
         EXISTS (SELECT 1 FROM organizations WHERE id = $2) AS organization_exists,
         EXISTS (
           SELECT 1 FROM signature_file_deletion_jobs
           WHERE organization_id = $2 AND file_url = 'https://files.test/deletion.pdf'
         ) AS cleanup_queued`,
      [userId, organizationId],
    );
    expect(persisted.rows[0]).toEqual({
      user_exists: false,
      organization_exists: false,
      cleanup_queued: true,
    });
    const lifecycle = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM account_lifecycle_events
       WHERE email_hash = encode(digest(lower($1), 'sha256'), 'hex')
       ORDER BY id`,
      [deletionEmail],
    );
    expect(lifecycle.rows.map((row) => row.event_type)).toEqual([
      'account.deletion_scheduled',
      'account.deletion_schedule_failed',
      'account.deletion_scheduled',
      'account.deletion_recovered',
      'account.deletion_scheduled',
      'account.deletion_completed',
    ]);
  });
});
