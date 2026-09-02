import { ReputationConfigurationService } from './reputation-configuration.service';

describe('ReputationConfigurationService bootstrap', () => {
  it('returns the cohesive platform and settings route model', async () => {
    const service = new ReputationConfigurationService({} as never);
    const platforms = [{ id: 4, platform: 'google' }];
    const settings = { organizationId: 3, autoRequestEnabled: true };
    jest.spyOn(service, 'platforms').mockResolvedValue(platforms as never);
    jest.spyOn(service, 'settings').mockResolvedValue(settings as never);

    await expect(service.bootstrap(3)).resolves.toEqual({ platforms, settings });
    expect(service.platforms).toHaveBeenCalledWith(3);
    expect(service.settings).toHaveBeenCalledWith(3);
  });

  it('loads one organization-scoped widget for editor routes', async () => {
    const row = {
      id: 8, organization_id: 3, widget_key: 'key', name: 'Homepage',
      widget_type: 'grid', theme: 'light', primary_color: '#2563EB',
      background_color: '#FFFFFF', text_color: '#0F172A', border_radius: 12,
      show_rating_stars: true, show_reviewer_photo: true, show_review_date: true,
      show_platform_icon: true, min_rating: 4, platforms: [], max_reviews: 6,
      hide_no_text_reviews: true, auto_refresh: true, refresh_interval_hours: 24,
      is_active: true, created_at: new Date('2026-08-31T00:00:00Z'),
      updated_at: new Date('2026-08-31T00:00:00Z'),
    };
    const repository = { getWidget: jest.fn().mockResolvedValue(row) };
    const service = new ReputationConfigurationService(repository as never);

    await expect(service.widget(3, 8)).resolves.toMatchObject({
      id: 8, organizationId: 3, widgetType: 'grid', minRating: 4,
    });
    expect(repository.getWidget).toHaveBeenCalledWith(3, 8);
  });

  it('creates widgets with a normalized fingerprint and maps exact replays', async () => {
    const row = {
      id: 8, organization_id: 3, widget_key: 'key', name: 'Homepage',
      widget_type: 'grid', theme: 'auto', primary_color: '#2563EB',
      background_color: '#FFFFFF', text_color: '#0F172A', border_radius: 12,
      show_rating_stars: true, show_reviewer_photo: true, show_review_date: true,
      show_platform_icon: true, min_rating: 4, platforms: [], max_reviews: 6,
      hide_no_text_reviews: true, auto_refresh: true, refresh_interval_hours: 24,
      is_active: true, created_at: new Date('2026-08-31T00:00:00Z'),
      updated_at: new Date('2026-08-31T00:00:00Z'),
    };
    const repository = {
      createWidget: jest.fn().mockResolvedValue({ kind: 'created', row, replayed: true }),
    };
    const service = new ReputationConfigurationService(repository as never);

    await expect(service.createWidget(
      3, 4, { name: ' Homepage ', widgetType: 'GRID', primaryColor: '#2563eb' }, 'create-key',
    )).resolves.toMatchObject({ id: 8, name: 'Homepage', primaryColor: '#2563EB' });
    expect(repository.createWidget).toHaveBeenCalledWith(
      3, 4, 'create-key', expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{32}$/),
      expect.objectContaining({ name: 'Homepage', widgetType: 'grid', primaryColor: '#2563EB' }),
    );
  });

  it('rejects invalid or reused widget creation keys', async () => {
    const repository = {
      createWidget: jest.fn().mockResolvedValue({ kind: 'idempotency_conflict' }),
    };
    const service = new ReputationConfigurationService(repository as never);

    await expect(service.createWidget(3, 4, { name: 'Homepage' }, 'bad key'))
      .rejects.toMatchObject({ extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT', reason: 'INVALID_IDEMPOTENCY_KEY',
      }) });
    await expect(service.createWidget(3, 4, { name: 'Homepage' }, 'reused-key'))
      .rejects.toMatchObject({ extensions: expect.objectContaining({
        code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED',
      }) });
  });
});
