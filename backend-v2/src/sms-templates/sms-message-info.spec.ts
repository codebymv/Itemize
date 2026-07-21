import { extractSmsTemplateVariables, smsMessageInfo } from './sms-message-info';

describe('SMS message information', () => {
  it('counts GSM extension characters as two septets', () => {
    expect(smsMessageInfo('a'.repeat(158) + '{}')).toEqual({
      length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144,
    });
  });

  it('uses concatenated GSM boundaries', () => {
    expect(smsMessageInfo('a'.repeat(160))).toMatchObject({ length: 160, segments: 1, charsRemaining: 0 });
    expect(smsMessageInfo('a'.repeat(161))).toMatchObject({ length: 161, segments: 2, charsRemaining: 145 });
  });

  it('counts Unicode using UTF-16 code units at UCS-2 boundaries', () => {
    expect(smsMessageInfo('ü'.repeat(70))).toMatchObject({ encoding: 'GSM', segments: 1 });
    expect(smsMessageInfo('🙂'.repeat(35))).toEqual({ length: 70, segments: 1, encoding: 'Unicode', charsRemaining: 0 });
    expect(smsMessageInfo('🙂'.repeat(36))).toEqual({ length: 72, segments: 2, encoding: 'Unicode', charsRemaining: 62 });
  });

  it('extracts variables uniquely in first-seen order', () => {
    expect(extractSmsTemplateVariables('{{first_name}} {{company}} {{first_name}}')).toEqual(['first_name', 'company']);
  });
});
