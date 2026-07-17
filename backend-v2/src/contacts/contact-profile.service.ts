import { Injectable } from '@nestjs/common';
import {
  ContactProfileActivityRow,
  ContactProfileBookingRow,
  ContactProfileCommunicationRow,
  ContactProfileInvoiceRow,
  ContactProfileListRow,
  ContactProfileNoteRow,
  ContactProfilePaymentRow,
  ContactProfileRepository,
  ContactProfileSignatureRow,
  ContactProfileTaskRow,
  ProfileSectionResult,
} from './contact-profile.repository';
import { ContactProfileSectionStatus } from './contact.enums';
import {
  ContactActivity,
  ContactProfile,
  ContactProfileBooking,
  ContactProfileCommunication,
  ContactProfileInvoice,
  ContactProfileList,
  ContactProfileNote,
  ContactProfilePayment,
  ContactProfileSignature,
  ContactProfileTask,
} from './contact.types';
import { ContactsService } from './contacts.service';

type ProfileRow = { total: number };
type ProfileCollection<T> = {
  status: ContactProfileSectionStatus;
  nodes: T[];
  total: number;
  hasMore: boolean;
};

@Injectable()
export class ContactProfileService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly profiles: ContactProfileRepository,
  ) {}

  async get(organizationId: number, contactId: number): Promise<ContactProfile> {
    const contact = await this.contacts.get(organizationId, contactId);
    const rows = await this.profiles.find(organizationId, contactId);

    return {
      contact,
      invoices: this.collection(rows.invoices, this.invoice),
      signatures: this.collection(rows.signatures, this.signature),
      payments: this.collection(rows.payments, this.payment),
      activities: this.collection(rows.activities, this.activity),
      notes: this.collection(rows.notes, this.note),
      lists: this.collection(rows.lists, this.list),
      communications: this.collection(rows.communications, this.communication),
      tasks: this.collection(rows.tasks, this.task),
      bookings: this.collection(rows.bookings, this.booking),
    };
  }

  private collection<R extends ProfileRow, T>(
    section: ProfileSectionResult<R>,
    map: (row: R) => T,
  ): ProfileCollection<T> {
    if (section.status === 'UNAVAILABLE') {
      return {
        status: ContactProfileSectionStatus.UNAVAILABLE,
        nodes: [],
        total: 0,
        hasMore: false,
      };
    }
    const total = section.rows[0]?.total ?? 0;
    return {
      status: ContactProfileSectionStatus.AVAILABLE,
      nodes: section.rows.map(map),
      total,
      hasMore: total > section.rows.length,
    };
  }

  private invoice(row: ContactProfileInvoiceRow): ContactProfileInvoice {
    return {
      id: Number(row.id),
      number: row.invoice_number,
      status: row.status,
      total: Number(row.total_amount),
      createdAt: new Date(row.created_at),
      dueDate: new Date(row.due_date),
    };
  }

  private signature(row: ContactProfileSignatureRow): ContactProfileSignature {
    return {
      id: Number(row.id),
      title: row.title,
      status: row.status,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      signedAt: row.signed_at ? new Date(row.signed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private payment(row: ContactProfilePaymentRow): ContactProfilePayment {
    return {
      id: Number(row.id),
      invoiceId: row.invoice_id === null ? null : Number(row.invoice_id),
      invoiceNumber: row.invoice_number,
      amount: Number(row.amount),
      date: new Date(row.date),
    };
  }

  private activity(row: ContactProfileActivityRow): ContactActivity {
    return {
      id: Number(row.id),
      contactId: Number(row.contact_id),
      userId: row.user_id === null ? null : Number(row.user_id),
      userName: row.user_name,
      userEmail: row.user_email,
      type: row.type as ContactActivity['type'],
      title: row.title,
      content: row.content ?? {},
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
    };
  }

  private note(row: ContactProfileNoteRow): ContactProfileNote {
    return {
      id: Number(row.id),
      title: row.title || 'Note',
      content: row.content || '',
      createdAt: new Date(row.created_at),
    };
  }

  private list(row: ContactProfileListRow): ContactProfileList {
    return {
      id: Number(row.id),
      title: row.title,
      category: row.category,
      createdAt: new Date(row.created_at),
    };
  }

  private communication(
    row: ContactProfileCommunicationRow,
  ): ContactProfileCommunication {
    return {
      id: Number(row.id),
      type: row.type,
      direction: row.sender_type === 'contact' ? 'inbound' : 'outbound',
      subject: row.subject || '',
      content: row.content,
      date: new Date(row.date),
    };
  }

  private task(row: ContactProfileTaskRow): ContactProfileTask {
    return {
      id: Number(row.id),
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      dueDate: row.due_date ? new Date(row.due_date) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private booking(row: ContactProfileBookingRow): ContactProfileBooking {
    return {
      id: Number(row.id),
      title: row.title || 'Booking',
      calendarId: Number(row.calendar_id),
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      status: row.status,
      source: row.source,
    };
  }
}
