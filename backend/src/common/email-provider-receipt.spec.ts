import { ResendEstimateEmailProvider } from '../estimates/estimate-email.provider';
import { ResendReputationEmailProvider } from '../reputation-requests/reputation-request-delivery.providers';
import { ResendTrialReminderEmailProvider } from '../trial-reminders/trial-reminders.service';
import { ResendWorkflowEmailProvider } from '../workflow-jobs/workflow-side-effect.providers';

describe('transactional email receipt boundary', () => {
  const originalKey = process.env.RESEND_API_KEY;
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });
  const message = { to:'qa@example.test',subject:'QA',html:'<p>QA</p>',text:'QA',tags:[],idempotencyKey:'qa-receipt' };
  const providers = [
    ['estimate', () => new ResendEstimateEmailProvider()],
    ['review', () => new ResendReputationEmailProvider()],
    ['trial', () => new ResendTrialReminderEmailProvider()],
    ['workflow/booking', () => new ResendWorkflowEmailProvider({} as import('pg').Pool)],
  ] as const;
  it.each(providers)('%s never accepts missing receipts or uncertain HTTP responses', async (_name, create) => {
    process.env.RESEND_API_KEY = 're_test_only';
    const mock = jest.spyOn(global,'fetch');
    for (const [status, body] of [[200,{}],[200,{id:' '}],[200,{id:123}],[503,{}],[409,{}]] as const) {
      mock.mockResolvedValueOnce(new Response(JSON.stringify(body),{status}));
      await expect(create().send(message)).rejects.toMatchObject({providerOutcomeUnknown:true,retryable:false});
    }
    mock.mockResolvedValueOnce(new Response(JSON.stringify({id:'provider-receipt'}),{status:200}));
    await expect(create().send(message)).resolves.toMatchObject({providerId:'provider-receipt'});
  });
  it('trial and workflow transport ambiguity cannot trigger an automatic resend', async () => {
    process.env.RESEND_API_KEY = 're_test_only';
    jest.spyOn(global,'fetch').mockRejectedValue(new Error('socket closed'));
    for (const [,create] of providers.slice(2)) {
      await expect(create().send(message)).rejects.toMatchObject({providerOutcomeUnknown:true,retryable:false});
    }
  });
});
