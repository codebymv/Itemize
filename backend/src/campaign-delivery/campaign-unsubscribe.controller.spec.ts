import { Response } from 'express';
import { CampaignUnsubscribeController } from './campaign-unsubscribe.controller';
import { CampaignUnsubscribeService } from './campaign-unsubscribe.service';

describe('CampaignUnsubscribeController', () => {
  let service: jest.Mocked<CampaignUnsubscribeService>;
  let controller: CampaignUnsubscribeController;
  let response: jest.Mocked<Response>;

  beforeEach(() => {
    service = {
      inspect: jest.fn(),
      unsubscribe: jest.fn(),
    } as unknown as jest.Mocked<CampaignUnsubscribeService>;
    controller = new CampaignUnsubscribeController(service);
    response = {
      set: jest.fn(),
      status: jest.fn(),
      type: jest.fn(),
      send: jest.fn(),
    } as unknown as jest.Mocked<Response>;
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
  });

  it('keeps GET read-only and returns a confirmation form', async () => {
    service.inspect.mockResolvedValue('ready');
    await controller.inspect('12.valid-token', response);

    expect(service.inspect).toHaveBeenCalledWith('12.valid-token');
    expect(service.unsubscribe).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith(expect.stringContaining('<form method="post"'));
    expect(response.set).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
  });

  it('honors RFC 8058 POST with an empty success response', async () => {
    service.unsubscribe.mockResolvedValue('unsubscribed');
    await controller.unsubscribe(
      '12.valid-token',
      { 'List-Unsubscribe': 'One-Click' },
      response,
    );

    expect(service.unsubscribe).toHaveBeenCalledWith('12.valid-token');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith('');
  });

  it('returns a useful confirmation page for a person submitting the form', async () => {
    service.unsubscribe.mockResolvedValue('unsubscribed');
    await controller.unsubscribe('12.valid-token', { confirm: '1' }, response);
    expect(response.send).toHaveBeenCalledWith(expect.stringContaining('You are unsubscribed'));
  });
});
