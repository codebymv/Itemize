import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PG_POOL } from '../database/database.module';

const storedUser = {
  id: 92,
  email: 'ai-contract@example.com',
  name: 'AI Contract User',
  password_hash: bcrypt.hashSync('valid-password', 4),
  provider: 'email',
  email_verified: true,
  role: 'USER',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('AI GraphQL HTTP contract', () => {
  let app: NestExpressApplication;
  const query = jest.fn();
  const end = jest.fn();
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'ai-e2e-secret';
    process.env.DATABASE_URL = 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://frontend.test.itemize';
    process.env.NODE_ENV = 'test';
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.FRONTEND_URL;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  beforeEach(() => query.mockReset());

  it('issues and consumes a one-time public marketing capability', async () => {
    const issued = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: '{ marketingChatToken { token } }',
      })
      .expect(200);
    const token = issued.body.data.marketingChatToken.token as string;

    const answered = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation Ask($input: MarketingChatAskInput!) {
          marketingChatAsk(input: $input) { reply }
        }`,
        variables: {
          input: {
            token,
            messages: [{ role: 'user', content: 'What is Itemize?' }],
          },
        },
      })
      .expect(200);

    expect(answered.body.errors).toBeUndefined();
    expect(answered.body.data.marketingChatAsk.reply).toContain(
      'support@itemize.cloud',
    );

    const replayed = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation Ask($input: MarketingChatAskInput!) {
          marketingChatAsk(input: $input) { reply }
        }`,
        variables: {
          input: {
            token,
            messages: [{ role: 'user', content: 'What is Itemize?' }],
          },
        },
      })
      .expect(200);

    expect(replayed.body.errors[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      reason: 'MARKETING_CHAT_TOKEN_INVALID',
    });
  });

  it('requires authentication before list or note suggestion work', async () => {
    for (const [field, input] of [
      ['listSuggestions', '{ listTitle: "Groceries", existingItems: ["Bread"] }'],
      ['noteSuggestions', '{ content: "A sufficiently long note" }'],
    ]) {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `mutation { ${field}(input: ${input}) { suggestions error } }`,
        })
        .expect(200);

      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
  });

  it('serves authenticated suggestions only with matching CSRF proof', async () => {
    const agent = request.agent(app.getHttpServer());
    query.mockResolvedValue({ rows: [storedUser] });
    await agent
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success }
        }`,
        variables: {
          input: { email: storedUser.email, password: 'valid-password' },
        },
      })
      .expect(200);

    const withoutCsrf = await agent
      .post('/graphql')
      .send({
        query: `mutation {
          listSuggestions(input: {
            listTitle: "Groceries",
            existingItems: ["Bread"]
          }) { suggestions error }
        }`,
      })
      .expect(200);
    expect(withoutCsrf.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'CSRF_COOKIE_MISSING',
    });

    const csrf = await agent
      .post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    const token = csrf.body.data.csrfToken.token as string;
    const suggested = await agent
      .post('/graphql')
      .set('x-csrf-token', token)
      .send({
        query: `mutation {
          listSuggestions(input: {
            listTitle: "Groceries",
            existingItems: ["Bread"]
          }) { suggestions error }
        }`,
      })
      .expect(200);

    expect(suggested.body.errors).toBeUndefined();
    expect(suggested.body.data.listSuggestions).toEqual({
      suggestions: [],
      error: 'Missing API key',
    });
  });
});
