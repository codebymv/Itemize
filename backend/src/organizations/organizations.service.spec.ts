import {
  OrganizationActivityRow,
  OrganizationMemberRow,
  OrganizationRow,
  OrganizationsRepository,
} from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { OrganizationOwnershipEmailService } from './organization-ownership-email.service';

const row = (values: Partial<OrganizationRow> = {}): OrganizationRow => ({
  id: 3,
  name: 'Alpha',
  slug: 'alpha',
  settings: { personal: true },
  logo_url: null,
  role: 'owner',
  is_default: true,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:01:00.000Z'),
  ...values,
});

const memberRow = (
  values: Partial<OrganizationMemberRow> = {},
): OrganizationMemberRow => ({
  id: 9,
  organization_id: 3,
  user_id: 8,
  role: 'owner',
  invited_at: new Date('2026-08-27T12:00:00.000Z'),
  joined_at: new Date('2026-08-27T12:01:00.000Z'),
  invited_by: 7,
  user_name: 'New Owner',
  email: 'owner@example.com',
  ...values,
});

describe('OrganizationsService', () => {
  let repository: jest.Mocked<OrganizationsRepository>;
  let ownershipEmail: jest.Mocked<OrganizationOwnershipEmailService>;
  let service: OrganizationsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      listForUser: jest.fn(),
      organizationAllowance: jest.fn(),
      listActivity: jest.fn(),
      update: jest.fn(),
      selectForUser: jest.fn(),
      ensureDefaultForUser: jest.fn(),
      transferOwnership: jest.fn(),
    } as unknown as jest.Mocked<OrganizationsRepository>;
    ownershipEmail = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrganizationOwnershipEmailService>;
    service = new OrganizationsService(repository, ownershipEmail);
  });

  it('returns ownership allowance and enforces the creation boundary', async () => {
    repository.organizationAllowance.mockResolvedValue({
      ownedCount: 1,
      limit: 3,
      canCreate: true,
      sourcePlan: 'starter',
    });
    await expect(service.allowance(7)).resolves.toEqual({
      ownedCount: 1,
      limit: 3,
      canCreate: true,
      sourcePlan: 'starter',
    });

    repository.create.mockResolvedValue({ kind: 'ok', row: row() });
    await expect(service.create(7, { name: 'Alpha' })).resolves.toMatchObject({
      id: 3,
      role: 'owner',
    });

    repository.create.mockResolvedValue({
      kind: 'limit_reached',
      current: 3,
      limit: 3,
      plan: 'starter',
    });
    await expect(service.create(7, { name: 'Fourth organization' })).rejects.toMatchObject({
      extensions: {
        code: 'FORBIDDEN',
        reason: 'ORGANIZATION_LIMIT_REACHED',
        current: 3,
        limit: 3,
      },
    });
  });

  it('maps membership rows into the bounded GraphQL organization shape', async () => {
    repository.listForUser.mockResolvedValue([
      row(),
      row({
        id: '4',
        name: 'Beta',
        settings: null,
        role: 'viewer',
        is_default: false,
      }),
    ]);

    await expect(service.list(7)).resolves.toEqual([
      expect.objectContaining({
        id: 3,
        name: 'Alpha',
        settings: { personal: true },
        role: 'owner',
        isDefault: true,
      }),
      expect.objectContaining({
        id: 4,
        name: 'Beta',
        settings: {},
        role: 'viewer',
        isDefault: false,
      }),
    ]);
  });

  it('persists only valid member selections without tenant enumeration', async () => {
    repository.selectForUser.mockResolvedValue(row());
    await expect(service.select(7, 3)).resolves.toMatchObject({
      id: 3,
      isDefault: true,
    });
    expect(repository.selectForUser).toHaveBeenCalledWith(7, 3);

    repository.selectForUser.mockResolvedValue(null);
    await expect(service.select(7, 99)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    await expect(service.select(7, 0)).rejects.toMatchObject({
      extensions: { reason: 'INVALID_ORGANIZATION_ID' },
    });
  });

  it('returns one ensured default and maps missing users and database errors', async () => {
    repository.ensureDefaultForUser.mockResolvedValue(row());
    await expect(service.ensureDefault(7)).resolves.toMatchObject({
      id: 3,
      isDefault: true,
    });

    repository.ensureDefaultForUser.mockResolvedValue(null);
    await expect(service.ensureDefault(404)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });

    repository.listForUser.mockRejectedValue(new Error('connection refused'));
    await expect(service.list(7)).rejects.toMatchObject({
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('validates typed organization preferences and the default business boundary', async () => {
    repository.update.mockResolvedValue({
      kind: 'ok',
      value: row({
        settings: {
          personal: true,
          timezone: 'America/Phoenix',
          locale: 'en-US',
          defaultBusinessId: 12,
        },
      }),
    });

    await expect(service.update(7, 3, {
      settings: {
        personal: true,
        timezone: 'America/Phoenix',
        locale: 'en-US',
        defaultBusinessId: 12,
      },
    })).resolves.toMatchObject({
      settings: { defaultBusinessId: 12, timezone: 'America/Phoenix' },
    });

    await expect(service.update(7, 3, {
      settings: { timezone: 'Not/A_Timezone' },
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_ORGANIZATION_TIMEZONE' },
    });
    await expect(service.update(7, 3, {
      settings: { locale: 'not a locale' },
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_ORGANIZATION_LOCALE' },
    });
    await expect(service.update(7, 3, {
      settings: { defaultBusinessId: -1 },
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_DEFAULT_BUSINESS' },
    });

    repository.update.mockResolvedValue({ kind: 'invalid_default_business' });
    await expect(service.update(7, 3, {
      settings: { defaultBusinessId: 99 },
    })).rejects.toMatchObject({
      extensions: { reason: 'INVALID_DEFAULT_BUSINESS' },
    });
  });

  it('maps ownership transfer outcomes without exposing another tenant', async () => {
    repository.transferOwnership.mockResolvedValue({
      kind: 'ok',
      row: memberRow(),
      delivery: {
        organizationName: 'Alpha',
        previousOwner: { name: 'Previous Owner', email: 'previous@example.com' },
        newOwner: { name: 'New Owner', email: 'owner@example.com' },
      },
    });
    await expect(service.transferOwnership(7, 3, 9)).resolves.toMatchObject({
      id: 9,
      userId: 8,
      role: 'owner',
      email: 'owner@example.com',
    });
    expect(ownershipEmail.send).toHaveBeenCalledWith(expect.objectContaining({
      organizationName: 'Alpha',
    }));

    repository.transferOwnership.mockResolvedValue({ kind: 'owner_required' });
    await expect(service.transferOwnership(7, 3, 9)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN', reason: 'OWNER_REQUIRED' },
    });

    repository.transferOwnership.mockResolvedValue({ kind: 'member_not_found' });
    await expect(service.transferOwnership(7, 3, 99)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });

    repository.transferOwnership.mockResolvedValue({
      kind: 'limit_reached',
      current: 2,
      limit: 1,
      plan: 'free',
    });
    await expect(service.transferOwnership(7, 3, 9)).rejects.toMatchObject({
      extensions: {
        code: 'FORBIDDEN',
        reason: 'ORGANIZATION_LIMIT_REACHED',
        current: 2,
        limit: 1,
      },
    });
  });

  it('returns bounded manager activity and hides it from other members', async () => {
    const activity: OrganizationActivityRow = {
      id: '42',
      organization_id: 3,
      event_type: 'organization.ownership_transferred',
      actor_user_id: 7,
      actor_name: 'Previous Owner',
      actor_email: 'previous@example.com',
      target_user_id: 8,
      target_name: 'New Owner',
      target_email: 'owner@example.com',
      payload: { targetUserId: 8 },
      occurred_at: new Date('2026-08-27T12:00:00.000Z'),
    };
    repository.listActivity.mockResolvedValue({ kind: 'ok', value: [activity] });
    await expect(service.activity(7, 3, 10)).resolves.toEqual([
      expect.objectContaining({ id: '42', targetUserId: 8 }),
    ]);
    expect(repository.listActivity).toHaveBeenCalledWith(7, 3, 10);

    repository.listActivity.mockResolvedValue({ kind: 'forbidden' });
    await expect(service.activity(9, 3)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
    await expect(service.activity(7, 3, 51)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});
