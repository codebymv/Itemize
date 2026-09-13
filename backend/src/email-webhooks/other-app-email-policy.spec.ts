import { otherAppSenders, senderMailbox } from './other-app-email-policy';

describe('other-app sender policy', () => {
  it('extracts an exact mailbox without trusting display names or suffix matches', () => {
    expect(senderMailbox('Gleam <noreply@gleamai.dev>')).toBe('noreply@gleamai.dev');
    expect(senderMailbox('noreply@gleamai.dev <attacker@example.test>')).toBe('attacker@example.test');
    expect(senderMailbox('a@example.test,b@example.test')).toBeNull();
    expect(senderMailbox('a@example.test\r\nFrom: b@example.test')).toBeNull();
    expect(senderMailbox(['a@example.test'])).toBeNull();
  });
  it('defaults to no classification and forbids Itemize senders and wildcard rules', () => {
    expect(otherAppSenders({}).size).toBe(0);
    for (const entry of ['noreply@itemize.cloud','x@mail.itemize.cloud','*@gleamai.dev','gleamai.dev']) {
      expect(() => otherAppSenders({ RESEND_OTHER_APP_SENDERS: entry })).toThrow();
    }
    expect(() => otherAppSenders({ EMAIL_FROM:'Custom <hi@example.test>', RESEND_OTHER_APP_SENDERS:'hi@example.test' })).toThrow();
    expect([...otherAppSenders({ RESEND_OTHER_APP_SENDERS:'noreply@gleamai.dev,noreply@tucsonlovesmusic.com' })]).toHaveLength(2);
  });
});
