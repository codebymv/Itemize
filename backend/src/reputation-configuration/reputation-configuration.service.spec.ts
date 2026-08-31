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
});
