import { OrganizationInvitationEmailService } from './organization-invitation-email.service';
import { OrganizationInvitationsRepository } from './organization-invitations.repository';
import { OrganizationInvitationsService } from './organization-invitations.service';

const row = {
  id: 9,
  organization_id: 4,
  organization_name: 'Alpha Studio',
  email: 'invitee@example.com',
  role: 'member',
  status: 'pending',
  invited_by: 7,
  invited_by_name: 'Ada',
  invited_at: new Date('2026-08-27T12:00:00.000Z'),
  expires_at: new Date('2026-09-03T12:00:00.000Z'),
  last_sent_at: null,
};

describe('OrganizationInvitationsService', () => {
  let repository: jest.Mocked<OrganizationInvitationsRepository>;
  let emails: jest.Mocked<OrganizationInvitationEmailService>;
  let service: OrganizationInvitationsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      create: jest.fn(),
      resend: jest.fn(),
      markDelivery: jest.fn(),
      revoke: jest.fn(),
      preview: jest.fn(),
      accept: jest.fn(),
    } as unknown as jest.Mocked<OrganizationInvitationsRepository>;
    emails = { send: jest.fn() } as unknown as jest.Mocked<OrganizationInvitationEmailService>;
    service = new OrganizationInvitationsService(repository, emails);
  });

  it('delivers a secure invitation and records successful delivery', async () => {
    repository.create.mockResolvedValue({
      kind: 'ok',
      invitation: {
        row, replayed: false, token: 'a'.repeat(64), tokenHash: 'b'.repeat(64),
      },
    });
    emails.send.mockResolvedValue(true);
    repository.markDelivery.mockResolvedValue(new Date('2026-08-27T12:01:00.000Z'));

    await expect(service.create(
      7, 4, ' Invitee@Example.com ', 'member', 'invitation-create-0001',
    ))
      .resolves.toMatchObject({
        id: 9,
        email: 'invitee@example.com',
        deliverySent: true,
        lastSentAt: new Date('2026-08-27T12:01:00.000Z'),
      });
    expect(repository.create).toHaveBeenCalledWith(
      7, 4, 'invitee@example.com', 'member', 'invitation-create-0001',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'invitee@example.com' }),
      'a'.repeat(64),
      'organization-invitation:4:invitation-create-0001',
    );
    expect(repository.markDelivery).toHaveBeenCalledWith(9, 'b'.repeat(64), true);
  });

  it('maps duplicate and plan-limit outcomes into stable GraphQL reasons', async () => {
    repository.create.mockResolvedValue({ kind: 'already_invited', invitationId: 9 });
    await expect(service.create(
      7, 4, row.email, 'member', 'invitation-create-0002',
    )).rejects.toMatchObject({
      extensions: { reason: 'INVITATION_ALREADY_PENDING', invitationId: 9 },
    });

    repository.create.mockResolvedValue({
      kind: 'limit_reached', current: 3, limit: 3, plan: 'starter',
    });
    await expect(service.create(
      7, 4, 'other@example.com', 'viewer', 'invitation-create-0003',
    )).rejects.toMatchObject({
      extensions: { reason: 'PLAN_LIMIT_REACHED', current: 3, limit: 3 },
    });
  });

  it('replays invitation results without delivering twice', async () => {
    repository.create.mockResolvedValue({
      kind: 'ok',
      invitation: { row, replayed: true, token: null, tokenHash: null },
    });
    await expect(service.create(
      7, 4, row.email, 'member', 'invitation-create-0004',
    )).resolves.toMatchObject({ id: 9, deliverySent: false });
    expect(emails.send).not.toHaveBeenCalled();
    expect(repository.markDelivery).not.toHaveBeenCalled();
  });

  it('does not report delivery when the prepared token was replaced before persistence', async () => {
    repository.create.mockResolvedValue({
      kind: 'ok',
      invitation: {
        row, replayed: false, token: 'a'.repeat(64), tokenHash: 'b'.repeat(64),
      },
    });
    emails.send.mockResolvedValue(true);
    repository.markDelivery.mockResolvedValue(null);

    await expect(service.create(
      7, 4, row.email, 'member', 'invitation-create-replaced-token',
    )).resolves.toMatchObject({ deliverySent: false, lastSentAt: null });
  });

  it('surfaces conflicting and unavailable invitation receipts', async () => {
    repository.create
      .mockResolvedValueOnce({ kind: 'idempotency_conflict' })
      .mockResolvedValueOnce({ kind: 'result_unavailable' });
    await expect(service.create(
      7, 4, row.email, 'member', 'invitation-create-0005',
    )).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });
    await expect(service.create(
      7, 4, row.email, 'member', 'invitation-create-0006',
    )).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
    });
  });

  it('replays revocation and rejects lifecycle key reuse', async () => {
    repository.revoke
      .mockResolvedValueOnce({ kind: 'revoked', replayed: true })
      .mockResolvedValueOnce({ kind: 'idempotency_conflict' });
    await expect(service.revoke(
      7, 4, 9, 'invitation-revoke-0001',
    )).resolves.toBe(true);
    await expect(service.revoke(
      7, 4, 9, 'invitation-revoke-0002',
    )).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('shows expired previews and requires the invited email at acceptance', async () => {
    repository.preview.mockResolvedValue({
      ...row,
      expires_at: new Date('2020-01-01T00:00:00.000Z'),
    });
    await expect(service.preview('a'.repeat(64))).resolves.toMatchObject({ status: 'expired' });

    repository.accept.mockResolvedValue({ kind: 'email_mismatch' });
    await expect(service.accept(11, 'a'.repeat(64))).rejects.toMatchObject({
      extensions: { reason: 'INVITATION_EMAIL_MISMATCH' },
    });
  });
});
