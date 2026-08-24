import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import twilio from 'twilio';
import { configureApp } from '../configure-app';
import { SmsWebhooksController } from './sms-webhooks.controller';
import { SmsWebhooksService } from './sms-webhooks.service';
import {
  SdkTwilioWebhookVerifier,
  TWILIO_WEBHOOK_VERIFIER,
} from './twilio-webhook.verifier';

const AUTH_TOKEN = 'twilio-test-auth-token';

describe('SmsWebhooksController retained HTTP contract', () => {
  let app: NestExpressApplication;
  const service = {
    processStatusEvent: jest.fn(),
    processInboundEvent: jest.fn(),
  };
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SmsWebhooksController],
      providers: [
        { provide: TWILIO_WEBHOOK_VERIFIER, useClass: SdkTwilioWebhookVerifier },
        { provide: SmsWebhooksService, useValue: service },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    delete process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;
  });

  afterEach(() => {
    for (const name of [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'SKIP_TWILIO_WEBHOOK_VALIDATION',
    ]) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  });

  const signedPost = async (
    path: string,
    params: Record<string, string>,
    { tamper = false } = {},
  ) => {
    const server = app.getHttpServer();
    const address = server.listen(0).address() as { port: number };
    const url = `http://127.0.0.1:${address.port}${path}`;
    const signature = twilio.getExpectedTwilioSignature(
      AUTH_TOKEN,
      url,
      params,
    );
    try {
      return await request(server)
        .post(path)
        .set('Host', `127.0.0.1:${address.port}`)
        .set('X-Twilio-Signature', tamper ? 'invalid' : signature)
        .type('form')
        .send(params);
    } finally {
      server.close();
    }
  };

  it('accepts a correctly signed status callback and maps the provider status', async () => {
    service.processStatusEvent.mockResolvedValue({ duplicate: false });
    const response = await signedPost('/api/sms-templates/webhook/status', {
      MessageSid: 'SM1',
      MessageStatus: 'read',
    });
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(service.processStatusEvent).toHaveBeenCalledWith({
      messageSid: 'SM1',
      dbStatus: 'delivered',
      errorCode: null,
      errorMessage: null,
      providerStatus: 'read',
    });
  });

  it('rejects a tampered signature outside production', async () => {
    const response = await signedPost(
      '/api/sms-templates/webhook/status',
      { MessageSid: 'SM1', MessageStatus: 'sent' },
      { tamper: true },
    );
    expect(response.status).toBe(403);
    expect(response.text).toBe('Invalid signature');
    expect(service.processStatusEvent).not.toHaveBeenCalled();
  });

  it('honors the non-production validation skip flag', async () => {
    process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';
    service.processStatusEvent.mockResolvedValue({ duplicate: true });
    const response = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/status')
      .type('form')
      .send({ MessageSid: 'SM1', MessageStatus: 'delivered' });
    expect(response.status).toBe(200);
    expect(response.text).toBe('Duplicate');
  });

  it('rejects missing and unsupported status inputs with retained text bodies', async () => {
    process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';
    const missing = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/status')
      .type('form')
      .send({ MessageStatus: 'sent' });
    expect(missing.status).toBe(400);
    expect(missing.text).toBe('MessageSid required');

    const unsupported = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/status')
      .type('form')
      .send({ MessageSid: 'SM1', MessageStatus: 'teleported' });
    expect(unsupported.status).toBe(400);
    expect(unsupported.text).toBe('Unsupported MessageStatus');
  });

  it('answers inbound messages with empty TwiML and validates required fields', async () => {
    process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';
    service.processInboundEvent.mockResolvedValue({
      duplicate: false,
      routed: true,
    });
    const response = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/inbound')
      .type('form')
      .send({
        MessageSid: 'SM2',
        From: '+15550001111',
        To: '+15559998888',
        Body: 'Hello',
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    expect(response.text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    );

    const missing = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/inbound')
      .type('form')
      .send({ MessageSid: 'SM3', From: '+15550001111' });
    expect(missing.status).toBe(400);
    expect(missing.text).toBe('Missing required fields');
  });

  it('maps processing crashes to the retained plain 500', async () => {
    process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';
    service.processStatusEvent.mockRejectedValue(new Error('deadlock'));
    const response = await request(app.getHttpServer())
      .post('/api/sms-templates/webhook/status')
      .type('form')
      .send({ MessageSid: 'SM1', MessageStatus: 'sent' });
    expect(response.status).toBe(500);
    expect(response.text).toBe('Error');
  });
});
