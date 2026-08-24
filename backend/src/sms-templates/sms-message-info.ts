import { SmsMessageInfo } from './sms-template.types';

const GSM_BASIC = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
));
const GSM_EXTENSION = new Set(Array.from('^{}\\[~]|€'));

export const smsMessageInfo = (message: string): SmsMessageInfo => {
  let septets = 0;
  let gsm = true;
  for (const character of Array.from(message)) {
    if (GSM_BASIC.has(character)) septets += 1;
    else if (GSM_EXTENSION.has(character)) septets += 2;
    else { gsm = false; break; }
  }
  const length = gsm ? septets : message.length;
  if (length === 0) return { length: 0, segments: 0, encoding: gsm ? 'GSM' : 'Unicode', charsRemaining: gsm ? 160 : 70 };
  const single = gsm ? 160 : 70;
  const multipart = gsm ? 153 : 67;
  const segments = length <= single ? 1 : Math.ceil(length / multipart);
  return {
    length,
    segments,
    encoding: gsm ? 'GSM' : 'Unicode',
    charsRemaining: (segments === 1 ? single : segments * multipart) - length,
  };
};

export const extractSmsTemplateVariables = (message: string): string[] => {
  const variables: string[] = [];
  const seen = new Set<string>();
  for (const match of message.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.has(match[1])) { seen.add(match[1]); variables.push(match[1]); }
  }
  return variables;
};
