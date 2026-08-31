import { IntegrationOverviewService } from './integration-overview.service';

describe('IntegrationOverviewService', () => {
  const calendarConnections = [{ id: 4, provider: 'google' }];

  it('returns the connection status needed by the integrations route', async () => {
    const service = new IntegrationOverviewService(
      { list: jest.fn().mockResolvedValue(calendarConnections) } as never,
      {
        channels: jest.fn().mockResolvedValue([
          { id: 8, name: 'Itemize', isActive: true },
        ]),
      } as never,
      { get: jest.fn().mockResolvedValue({ stripeConnected: true }) } as never,
    );

    await expect(service.get(3, 9)).resolves.toEqual({
      calendarConnections,
      facebookChannel: { id: 8, name: 'Itemize' },
      facebookStatusAvailable: true,
      stripeConnected: true,
      stripeStatusAvailable: true,
    });
  });

  it('keeps optional provider failures distinct from disconnected state', async () => {
    const service = new IntegrationOverviewService(
      { list: jest.fn().mockResolvedValue(calendarConnections) } as never,
      { channels: jest.fn().mockRejectedValue(new Error('social offline')) } as never,
      { get: jest.fn().mockRejectedValue(new Error('settings offline')) } as never,
    );

    await expect(service.get(3, 9)).resolves.toMatchObject({
      calendarConnections,
      facebookChannel: null,
      facebookStatusAvailable: false,
      stripeConnected: false,
      stripeStatusAvailable: false,
    });
  });
});
