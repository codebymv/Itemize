import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../configure-app';
import { EmailWebhooksController } from './email-webhooks.controller';
import {
  EmailWebhookInputError,
  EmailWebhooksService,
} from './email-webhooks.service';
import {
  RESEND_WEBHOOK_VERIFIER,
  ResendWebhookUnavailableError,
  ResendWebhookVerificationError,
} from './resend-webhook.verifier';

describe('EmailWebhooksController retained HTTP contract', () => {
  let app: NestExpressApplication;
  const verifier = { verify: jest.fn() };
  const service = { processResendEvent: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmailWebhooksController],
      providers: [
        { provide: RESEND_WEBHOOK_VERIFIER, useValue: verifier },
        { provide: EmailWebhooksService, useValue: service },
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
  });

  const post = () =>
    request(app.getHttpServer())
      .post('/api/email/webhook/resend')
      .set('svix-id', 'msg_1')
      .send({ type: 'email.delivered' });

  it('reports 503 when the signing secret is not configured', async () => {
    verifier.verify.mockImplementation(() => {
      throw new ResendWebhookUnavailableError();
    });
    const response = await post().expect(503);
    expect(response.body).toEqual({ error: 'Webhook verification unavailable' });
    expect(service.processResendEvent).not.toHaveBeenCalled();
  });

  it('rejects failed verification with the retained body', async () => {
    verifier.verify.mockImplementation(() => {
      throw new ResendWebhookVerificationError('bad signature');
    });
    const response = await post().expect(400);
    expect(response.body).toEqual({ error: 'Invalid webhook' });
  });

  it('rejects invalid verified events with the retained body', async () => {
    verifier.verify.mockReturnValue({ type: 'email.delivered' });
    service.processResendEvent.mockRejectedValue(
      new EmailWebhookInputError('Invalid email provider id'),
    );
    const response = await post().expect(400);
    expect(response.body).toEqual({ error: 'Invalid webhook event' });
  });

  it('passes the raw body and svix headers to the verifier and returns the result', async () => {
    verifier.verify.mockReturnValue({ type: 'email.delivered' });
    service.processResendEvent.mockResolvedValue({
      duplicate: false,
      matched: true,
      pending: false,
    });
    const response = await post().expect(200);
    expect(response.body).toEqual({
      received: true,
      duplicate: false,
      matched: true,
      pending: false,
    });
    const [rawBody, headers] = verifier.verify.mock.calls[0];
    expect(Buffer.isBuffer(rawBody)).toBe(true);
    expect(JSON.parse(rawBody.toString('utf8'))).toEqual({
      type: 'email.delivered',
    });
    expect(headers['svix-id']).toBe('msg_1');
    expect(service.processResendEvent).toHaveBeenCalledWith('msg_1', {
      type: 'email.delivered',
    });
  });

  it('maps processing crashes to the retained 500 envelope', async () => {
    verifier.verify.mockReturnValue({ type: 'email.delivered' });
    service.processResendEvent.mockRejectedValue(new Error('deadlock'));
    const response = await post().expect(500);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    });
  });
});
