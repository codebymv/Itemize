const smsService = require('../../services/smsService');

describe('SmsService provider attempt policy', () => {
  let originalClient;
  let originalConfigured;
  let originalFromNumber;

  beforeEach(() => {
    originalClient = smsService.client;
    originalConfigured = smsService.isConfigured;
    originalFromNumber = smsService.fromNumber;
    smsService.isConfigured = true;
    smsService.fromNumber = '+16025550100';
  });

  afterEach(() => {
    smsService.client = originalClient;
    smsService.isConfigured = originalConfigured;
    smsService.fromNumber = originalFromNumber;
    jest.restoreAllMocks();
  });

  test('does not internally retry an ambiguous Twilio create failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('socket closed'));
    smsService.client = { messages: { create } };
    jest.spyOn(smsService, 'withTimeout').mockImplementation(operation => operation());

    const result = await smsService.sendSms({
      to: '+16025550101',
      message: 'Hello',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      outcomeUnknown: true,
      error: 'socket closed',
    });
  });

  test('treats a Twilio HTTP rejection as a known failure', async () => {
    const error = new Error('Invalid destination');
    error.status = 400;
    error.code = 21211;
    const create = jest.fn().mockRejectedValue(error);
    smsService.client = { messages: { create } };
    jest.spyOn(smsService, 'withTimeout').mockImplementation(operation => operation());

    const result = await smsService.sendSms({
      to: '+16025550101',
      message: 'Hello',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      outcomeUnknown: false,
      code: 21211,
    });
  });
});
