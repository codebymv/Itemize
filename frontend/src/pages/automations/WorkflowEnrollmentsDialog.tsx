import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, RefreshCw, RotateCcw, UserPlus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  cancelEnrollment,
  enrollContact,
  getWorkflowEnrollments,
  pauseEnrollment,
  resumeEnrollment,
  retryEnrollment,
  type WorkflowEnrollment,
} from '@/services/automationsApi';
import { getContacts } from '@/services/contactsApi';
import type { Contact } from '@/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  workflowId: number;
};

const contactName = (contact: Pick<Contact, 'first_name' | 'last_name' | 'email'>): string =>
  [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unnamed contact';

const errorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return error instanceof Error ? error.message : fallback;
};

export function WorkflowEnrollmentsDialog({ open, onOpenChange, organizationId, workflowId }: Props) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [enrollments, setEnrollments] = useState<WorkflowEnrollment[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const loadEnrollments = useCallback(async () => {
    const result = await getWorkflowEnrollments(workflowId, organizationId, { page: 1, limit: 50 });
    setEnrollments(result.enrollments);
  }, [organizationId, workflowId]);

  const loadContacts = useCallback(async (query = '') => {
    const result = await getContacts({
      organization_id: organizationId,
      status: 'active',
      search: query.trim() || undefined,
      sort_by: 'first_name',
      sort_order: 'asc',
      page: 1,
      limit: 25,
    }, organizationId);
    setContacts(result.contacts);
  }, [organizationId]);

  const loadData = useCallback(async (contactQuery = '') => {
    setLoading(true);
    try {
      await Promise.all([loadContacts(contactQuery), loadEnrollments()]);
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, 'Failed to load enrollments'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [loadContacts, loadEnrollments, toast]);

  const searchContacts = async () => {
    setLoading(true);
    try {
      await loadContacts(search);
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, 'Failed to load contacts'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadData();
  }, [loadData, open]);

  const enroll = async () => {
    const contactId = Number(selectedContactId);
    if (!Number.isInteger(contactId) || contactId < 1) return;
    setWorking('enroll');
    try {
      await enrollContact(workflowId, contactId, organizationId, { source: 'manual' });
      setSelectedContactId('');
      await loadEnrollments();
      toast({ title: 'Enrolled', description: 'Contact enrolled successfully' });
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, 'Failed to enroll contact'), variant: 'destructive' });
    } finally {
      setWorking(null);
    }
  };

  const changeState = async (enrollment: WorkflowEnrollment, action: 'pause' | 'resume' | 'retry' | 'cancel') => {
    if (action === 'cancel' && !window.confirm('Cancel this enrollment? This cannot be resumed.')) return;
    setWorking(`${action}-${enrollment.id}`);
    try {
      if (action === 'pause') await pauseEnrollment(workflowId, enrollment.id, organizationId);
      else if (action === 'resume') await resumeEnrollment(workflowId, enrollment.id, organizationId);
      else if (action === 'retry') await retryEnrollment(workflowId, enrollment.id, organizationId);
      else await cancelEnrollment(workflowId, enrollment.id, organizationId);
      await loadEnrollments();
      const pastTense = { pause: 'paused', resume: 'resumed', retry: 'retried', cancel: 'cancelled' }[action];
      toast({ title: 'Updated', description: `Enrollment ${pastTense} successfully` });
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, `Failed to ${action} enrollment`), variant: 'destructive' });
    } finally {
      setWorking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enrollments</DialogTitle>
          <DialogDescription>Enroll a contact and manage recent workflow runs.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="workflow-contact-search">Find contact</Label>
            <div className="flex gap-2">
              <Input
                id="workflow-contact-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void searchContacts(); }
                }}
                placeholder="Name or email"
              />
              <Button type="button" variant="outline" onClick={() => void searchContacts()} disabled={loading}>Search</Button>
            </div>
            <Label htmlFor="workflow-contact">Contact</Label>
            <select
              id="workflow-contact"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedContactId}
              onChange={(event) => setSelectedContactId(event.target.value)}
            >
              <option value="">Select a contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactName(contact)}{contact.email ? ` — ${contact.email}` : ''}
                </option>
              ))}
            </select>
          </div>
          <Button className="self-end" onClick={() => void enroll()} disabled={!selectedContactId || working !== null}>
            <UserPlus className="mr-2 h-4 w-4" />
            {working === 'enroll' ? 'Enrolling…' : 'Enroll'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm font-medium">Recent enrollments</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadData(search)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {!loading && enrollments.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No enrollments yet.</p>
          )}
          {enrollments.map((enrollment) => {
            const busy = working?.endsWith(`-${enrollment.id}`) ?? false;
            return (
              <div key={enrollment.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{contactName(enrollment)}</p>
                    <Badge variant="secondary">{enrollment.status}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{enrollment.email || `Contact #${enrollment.contact_id}`}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enrollment.status === 'active' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeState(enrollment, 'pause')}>
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                    </Button>
                  )}
                  {enrollment.status === 'paused' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeState(enrollment, 'resume')}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Resume
                    </Button>
                  )}
                  {enrollment.status === 'failed' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeState(enrollment, 'retry')}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
                    </Button>
                  )}
                  {!['completed', 'cancelled'].includes(enrollment.status) && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
                      onClick={() => void changeState(enrollment, 'cancel')}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
