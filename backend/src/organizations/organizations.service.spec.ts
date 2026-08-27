import {
  OrganizationMemberRow,
  OrganizationRow,
  OrganizationsRepository,
} from './organizations.repository';
import { OrganizationsService } from './organizations.service';

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
  let service: OrganizationsService;

  beforeEach(() => {
    repository = {
      listForUser: jest.fn(),
      update: jest.fn(),
      selectForUser: jest.fn(),
      ensureDefaultForUser: jest.fn(),
      transferOwnership: jest.fn(),
    } as unknown as jest.Mocked<OrganizationsRepository>;
    service = new OrganizationsService(repository);
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
    });
    await expect(service.transferOwnership(7, 3, 9)).resolves.toMatchObject({
      id: 9,
      userId: 8,
      role: 'owner',
      email: 'owner@example.com',
    });

    repository.transferOwnership.mockResolvedValue({ kind: 'owner_required' });
    await expect(service.transferOwnership(7, 3, 9)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN', reason: 'OWNER_REQUIRED' },
    });

    repository.transferOwnership.mockResolvedValue({ kind: 'member_not_found' });
    await expect(service.transferOwnership(7, 3, 99)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
