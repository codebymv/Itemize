import type { Contact } from '@/types';

/** Mirrors the server's contactName derivation: person name, else company, else email. */
export const contactDisplayName = (
  contact: Pick<Contact, 'first_name' | 'last_name' | 'company' | 'email'> | null | undefined,
): string | null => {
  if (!contact) return null;
  const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return name || contact.company || contact.email || null;
};
