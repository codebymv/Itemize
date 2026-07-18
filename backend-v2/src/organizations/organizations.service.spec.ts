import {
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

describe('OrganizationsService', () => {
  let repository: jest.Mocked<OrganizationsRepository>;
  let service: OrganizationsService;

  beforeEach(() => {
    repository = {
      listForUser: jest.fn(),
      selectForUser: jest.fn(),
      ensureDefaultForUser: jest.fn(),
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
});
