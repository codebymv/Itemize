import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { RealtimeHostService } from '../realtime-host/realtime-host.service';
import { ChatWidgetPublicController } from './chat-widget-public.controller';
import { ChatWidgetPublicRepository } from './chat-widget-public.repository';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

const mockResponse = (): MockResponse => {
  const response = {} as MockResponse;
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
};

describe('ChatWidgetPublicController', () => {
  let controller: ChatWidgetPublicController;
  let repository: jest.Mocked<
    Pick<
      ChatWidgetPublicRepository,
      | 'widgetConfig'
      | 'startSession'
      | 'sessionMessages'
      | 'recordVisitorMessage'
      | 'endSession'
      | 'activeSession'
    >
  >;
  let realtimeHost: { emitToOrgChat: jest.Mock; broadcast: jest.Mock };

  beforeEach(async () => {
    repository = {
      widgetConfig: jest.fn(),
      startSession: jest.fn(),
      sessionMessages: jest.fn(),
      recordVisitorMessage: jest.fn(),
      endSession: jest.fn(),
      activeSession: jest.fn(),
    };
    realtimeHost = {
      emitToOrgChat: jest.fn(),
      broadcast: jest.fn().mockReturnValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatWidgetPublicController],
      providers: [
        { provide: ChatWidgetPublicRepository, useValue: repository },
        { provide: RealtimeHostService, useValue: realtimeHost },
      ],
    }).compile();
    controller = moduleRef.get(ChatWidgetPublicController);
  });

  it('answers repository failures with the exact legacy 500 dialect', async () => {
    repository.widgetConfig.mockRejectedValue(new Error('connection refused'));
    const response = mockResponse();
    await controller.config('cw_abc', response);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Failed to fetch widget config', code: 'ERROR' },
    });
  });

  it('does not leak internal error text on message submission failures', async () => {
    repository.recordVisitorMessage.mockRejectedValue(
      new Error('relation chat_messages does not exist'),
    );
    const response = mockResponse();
    await controller.sendMessage(
      { session_token: 'cs_' + 'a'.repeat(48), content: 'hi' },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(body.error.message).toBe('Failed to send message');
  });

  it('skips realtime emission entirely on validation rejections', async () => {
    const response = mockResponse();
    await controller.typing({}, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(realtimeHost.emitToOrgChat).not.toHaveBeenCalled();
  });

  it('survives an unattached realtime host on end-session', async () => {
    repository.endSession.mockResolvedValue({ id: 5, organization_id: 9 });
    const response = mockResponse();
    await controller.endSession(
      { session_token: 'cs_' + 'b'.repeat(48) },
      response,
    );
    expect(realtimeHost.emitToOrgChat).toHaveBeenCalledWith(
      9,
      'chatSessionEnded',
      expect.objectContaining({ session_id: 5 }),
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true });
  });
});
