export interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'failed';
  recipient_count: number;
  sent_count: number;
  open_rate?: number;
  click_rate?: number;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
}
