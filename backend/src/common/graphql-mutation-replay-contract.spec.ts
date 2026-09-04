import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import {
  GraphQLArgument,
  GraphQLInputField,
  getNamedType,
  isInputObjectType,
  isNonNullType,
} from 'graphql';
import { AppModule } from '../app.module';
import { PG_POOL } from '../database/database.module';

const replayBoundaryField = (
  field: GraphQLArgument | GraphQLInputField,
): boolean => field.name === 'idempotencyKey'
  && isNonNullType(field.type)
  && getNamedType(field.type).name === 'String';

const hasRequiredReplayKey = (argument: GraphQLArgument): boolean => {
  if (replayBoundaryField(argument)) return true;
  const inputType = getNamedType(argument.type);
  return isInputObjectType(inputType)
    && Object.values(inputType.getFields()).some(replayBoundaryField);
};

// The replay contract has no accepted exceptions. Any new create, duplicate,
// or publish mutation without a required replay key fails this test.
const KNOWN_NON_REPLAY_SAFE_MUTATIONS: string[] = [];

// These authenticated operations enqueue provider work or commit a financial
// side effect. The list is deliberately explicit so renames and newly added
// dispatch paths require a contract decision instead of relying on a prefix.
const BUSINESS_DISPATCH_MUTATIONS = [
  'createBillingCheckoutSession',
  'createBillingPortalSession',
  'createInvoicePaymentLink',
  'enqueueAdminEmailBatch',
  'enqueueContactEmail',
  'enqueueContactSms',
  'generateRecurringInvoiceNow',
  'recordInvoicePayment',
  'recordPayment',
  'refundPayment',
  'requestCalendarSync',
  'resendOrganizationInvitation',
  'resendReputationRequest',
  'retrySignatureDocument',
  'sendAgentChatMessage',
  'sendBulkReputationRequests',
  'sendCampaign',
  'sendCampaignTest',
  'sendConversationMessage',
  'sendEmailTemplateTest',
  'sendEstimate',
  'sendInvoice',
  'sendReputationRequest',
  'sendSignatureDocument',
  'sendSignatureReminder',
  'sendSmsTemplateTest',
  'sendSocialMessage',
  'transferOrganizationOwnership',
];

describe('GraphQL mutation replay contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'graphql-replay-contract-secret';
    process.env.DATABASE_URL = 'postgresql://unused/replay-contract';
    process.env.FRONTEND_URL = 'https://frontend.test.itemize';
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.FRONTEND_URL;
  });

  it('requires every create, duplicate, and publish mutation to be classified', () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const mutationFields = Object.values(schema.getMutationType()?.getFields() ?? {});
    const replayRelevant = mutationFields
      .filter((field) => /^(create|duplicate|publish)/.test(field.name));
    const missingReplayBoundary = replayRelevant
      .filter((field) => !field.args.some(hasRequiredReplayKey))
      .map((field) => field.name)
      .sort();

    expect(replayRelevant.length).toBeGreaterThan(35);
    expect(missingReplayBoundary).toEqual(KNOWN_NON_REPLAY_SAFE_MUTATIONS);
  });

  it('requires every business dispatch mutation to expose a replay boundary', () => {
    const mutationFields = app.get(GraphQLSchemaHost).schema
      .getMutationType()?.getFields() ?? {};
    const missingOperations = BUSINESS_DISPATCH_MUTATIONS
      .filter((name) => !mutationFields[name]);
    const missingReplayBoundary = BUSINESS_DISPATCH_MUTATIONS
      .filter((name) => mutationFields[name])
      .filter((name) => !mutationFields[name]?.args.some(hasRequiredReplayKey));

    expect(missingOperations).toEqual([]);
    expect(missingReplayBoundary).toEqual([]);
  });
});
