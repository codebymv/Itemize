export interface Segment {
  id: number;
  name: string;
  description?: string;
  type: 'dynamic' | 'static';
  contact_count: number;
  filters?: unknown;
  created_at: string;
  updated_at: string;
}
