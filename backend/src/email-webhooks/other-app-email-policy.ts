/** Exact mailboxes reserved for other apps in this shared Resend account. */
export function senderMailbox(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n]/.test(value)) return null;
  const text = value.trim();
  const mailbox = (text.match(/^[^<>]*<([^<>]+)>$/)?.[1] ?? text).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(mailbox)
    ? mailbox : null;
}

export function otherAppSenders(environment: NodeJS.ProcessEnv = process.env): Set<string> {
  const entries = (environment.RESEND_OTHER_APP_SENDERS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ownSender = senderMailbox(environment.EMAIL_FROM ?? 'noreply@itemize.cloud');
  const senders = new Set<string>();
  for (const entry of entries) {
    const mailbox = senderMailbox(entry);
    if (!mailbox || mailbox.includes('*') || mailbox !== entry.toLowerCase() || mailbox === ownSender
      || /@(?:[^@]+\.)?itemize\.cloud$/.test(mailbox)) {
      throw new Error('RESEND_OTHER_APP_SENDERS must contain exact non-Itemize sender mailboxes');
    }
    senders.add(mailbox);
  }
  return senders;
}

export function verifiedOtherAppSender(value: unknown): string | null {
  const mailbox = senderMailbox(value);
  return mailbox && otherAppSenders().has(mailbox) ? mailbox : null;
}
