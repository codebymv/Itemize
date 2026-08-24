import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type ProfileRow = {
  total: number;
};

export type ProfileSectionResult<T extends ProfileRow> =
  | { status: 'AVAILABLE'; rows: T[] }
  | { status: 'UNAVAILABLE'; rows: [] };

export type ContactProfileInvoiceRow = ProfileRow & {
  id: number;
  invoice_number: string;
  status: string;
  total_amount: string | number;
  created_at: Date;
  due_date: Date | string;
};

export type ContactProfileSignatureRow = ProfileRow & {
  id: number;
  title: string;
  status: string;
  sent_at: Date | null;
  signed_at: Date | null;
  created_at: Date;
};

export type ContactProfilePaymentRow = ProfileRow & {
  id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  amount: string | number;
  date: Date;
};

export type ContactProfileActivityRow = ProfileRow & {
  id: number;
  contact_id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  type: string;
  title: string | null;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

export type ContactProfileNoteRow = ProfileRow & {
  id: number;
  title: string | null;
  content: string | null;
  created_at: Date;
};

export type ContactProfileListRow = ProfileRow & {
  id: number;
  title: string;
  category: string | null;
  created_at: Date;
};

export type ContactProfileCommunicationRow = ProfileRow & {
  id: number;
  type: string;
  sender_type: string;
  content: string;
  date: Date;
  subject: string | null;
};

export type ContactProfileTaskRow = ProfileRow & {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

export type ContactProfileBookingRow = ProfileRow & {
  id: number;
  title: string | null;
  calendar_id: number;
  start_time: Date;
  end_time: Date;
  status: string;
  source: string;
};

export type ContactProfileRows = {
  invoices: ProfileSectionResult<ContactProfileInvoiceRow>;
  signatures: ProfileSectionResult<ContactProfileSignatureRow>;
  payments: ProfileSectionResult<ContactProfilePaymentRow>;
  activities: ProfileSectionResult<ContactProfileActivityRow>;
  notes: ProfileSectionResult<ContactProfileNoteRow>;
  lists: ProfileSectionResult<ContactProfileListRow>;
  communications: ProfileSectionResult<ContactProfileCommunicationRow>;
  tasks: ProfileSectionResult<ContactProfileTaskRow>;
  bookings: ProfileSectionResult<ContactProfileBookingRow>;
};

const limits = {
  invoices: 10,
  signatures: 10,
  payments: 50,
  activities: 50,
  notes: 20,
  lists: 20,
  communications: 50,
  tasks: 20,
  bookings: 20,
} as const;

@Injectable()
export class ContactProfileRepository {
  private readonly logger = new Logger(ContactProfileRepository.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(organizationId: number, contactId: number): Promise<ContactProfileRows> {
    const [
      invoices,
      signatures,
      payments,
      activities,
      notes,
      lists,
      communications,
      tasks,
      bookings,
    ] = await Promise.all([
      this.section<ContactProfileInvoiceRow>(
        'invoices',
        `SELECT i.id, i.invoice_number, i.status,
                i.total AS total_amount, i.created_at, i.due_date,
                COUNT(*) OVER()::int AS total
         FROM invoices i
         WHERE i.organization_id = $1 AND i.contact_id = $2
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileSignatureRow>(
        'signatures',
        `SELECT sd.id, sd.title, sr.status,
                COALESCE(sr.sent_at, sd.sent_at) AS sent_at,
                sr.signed_at, sd.created_at,
                COUNT(*) OVER()::int AS total
         FROM signature_documents sd
         JOIN signature_recipients sr
           ON sr.document_id = sd.id
          AND sr.organization_id = sd.organization_id
         WHERE sd.organization_id = $1 AND sr.contact_id = $2
         ORDER BY sd.created_at DESC, sd.id DESC, sr.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfilePaymentRow>(
        'payments',
        `SELECT p.id, p.invoice_id, i.invoice_number, p.amount,
                COALESCE(p.paid_at, p.created_at) AS date,
                COUNT(*) OVER()::int AS total
         FROM payments p
         LEFT JOIN invoices i
           ON i.id = p.invoice_id
          AND i.organization_id = p.organization_id
         WHERE p.organization_id = $1
           AND (p.contact_id = $2 OR i.contact_id = $2)
         ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileActivityRow>(
        'activities',
        `SELECT ca.id, ca.contact_id, ca.user_id,
                u.name AS user_name, u.email AS user_email,
                ca.type, ca.title, ca.content, ca.metadata, ca.created_at,
                COUNT(*) OVER()::int AS total
         FROM contact_activities ca
         JOIN contacts c
           ON c.id = ca.contact_id
          AND c.organization_id = $1
         LEFT JOIN organization_members om
           ON om.organization_id = c.organization_id
          AND om.user_id = ca.user_id
         LEFT JOIN users u ON u.id = om.user_id
         WHERE ca.contact_id = $2
         ORDER BY ca.created_at DESC, ca.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileNoteRow>(
        'notes',
        `SELECT n.id, n.title, n.content, n.created_at,
                COUNT(*) OVER()::int AS total
         FROM notes n
         WHERE n.organization_id = $1 AND n.contact_id = $2
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileListRow>(
        'lists',
        `SELECT l.id, l.title, l.category, l.created_at,
                COUNT(*) OVER()::int AS total
         FROM lists l
         WHERE l.organization_id = $1 AND l.contact_id = $2
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileCommunicationRow>(
        'communications',
        `SELECT m.id, m.channel AS type, m.sender_type, m.content,
                m.created_at AS date, c.subject,
                COUNT(*) OVER()::int AS total
         FROM messages m
         JOIN conversations c
           ON c.id = m.conversation_id
          AND c.organization_id = m.organization_id
         WHERE c.organization_id = $1 AND c.contact_id = $2
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileTaskRow>(
        'tasks',
        `SELECT t.id, t.title, t.description, t.status, t.priority,
                t.due_date, t.completed_at, t.created_at,
                COUNT(*) OVER()::int AS total
         FROM tasks t
         WHERE t.organization_id = $1 AND t.contact_id = $2
         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC, t.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
      this.section<ContactProfileBookingRow>(
        'bookings',
        `SELECT b.id, b.title, b.calendar_id, b.start_time, b.end_time,
                b.status, b.source,
                COUNT(*) OVER()::int AS total
         FROM bookings b
         WHERE b.organization_id = $1 AND b.contact_id = $2
         ORDER BY b.start_time DESC, b.id DESC
         LIMIT $3`,
        organizationId,
        contactId,
      ),
    ]);

    return {
      invoices,
      signatures,
      payments,
      activities,
      notes,
      lists,
      communications,
      tasks,
      bookings,
    };
  }

  private async section<T extends ProfileRow>(
    section: keyof typeof limits,
    sql: string,
    organizationId: number,
    contactId: number,
  ): Promise<ProfileSectionResult<T>> {
    try {
      const result = await this.pool.query(sql, [
        organizationId,
        contactId,
        limits[section],
      ]);
      return { status: 'AVAILABLE', rows: result.rows as T[] };
    } catch {
      this.logger.warn(`Contact profile section unavailable: ${section}`);
      return { status: 'UNAVAILABLE', rows: [] };
    }
  }
}
