import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw, RotateCcw, UserPlus, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  cancelEnrollment, enrollContact, getWorkflowEnrollments, pauseEnrollment, resumeEnrollment,
  retryEnrollment, type WorkflowEnrollment,
} from '@/services/automationsApi';
import { getContacts } from '@/services/contactsApi';
import type { Contact } from '@/types';
import { cn } from '@/lib/utils';
import { getWorkflowEnrollmentStatusVisual } from './constants/workflowConstants';

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

const formatDateTime = (value?: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export function WorkflowEnrollmentsDialog({ open, onOpenChange, organizationId, workflowId }: Props) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [enrollments, setEnrollments] = useState<WorkflowEnrollment[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [enrollmentToCancel, setEnrollmentToCancel] = useState<WorkflowEnrollment | null>(null);

  const loadEnrollments = useCallback(async (requestedPage = 1) => {
    const result = await getWorkflowEnrollments(workflowId, organizationId, { page: requestedPage, limit: 50 });
    setEnrollments(result.enrollments);
    setPagination(result.pagination);
    setPage(result.pagination.page);
  }, [organizationId, workflowId]);

  const loadContacts = useCallback(async (query = '') => {
    const result = await getContacts({
      organization_id: organizationId, status: 'active', search: query.trim() || undefined,
      sort_by: 'first_name', sort_order: 'asc', page: 1, limit: 25,
    }, organizationId);
    setContacts(result.contacts);
  }, [organizationId]);

  const loadData = useCallback(async (contactQuery = '') => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([loadContacts(contactQuery), loadEnrollments(1)]);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load automation runs'));
    } finally {
      setLoading(false);
    }
  }, [loadContacts, loadEnrollments]);

  useEffect(() => {
    if (open) void loadData();
  }, [loadData, open]);

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

  const enroll = async () => {
    const contactId = Number(selectedContactId);
    if (!Number.isInteger(contactId) || contactId < 1) return;
    setWorking('enroll');
    try {
      await enrollContact(workflowId, contactId, organizationId, { source: 'manual' });
      setSelectedContactId('');
      await loadEnrollments(1);
      toast({ title: 'Enrolled', description: 'Contact enrolled successfully' });
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, 'Failed to enroll contact'), variant: 'destructive' });
    } finally {
      setWorking(null);
    }
  };

  const changeState = async (enrollment: WorkflowEnrollment, action: 'pause' | 'resume' | 'retry' | 'cancel') => {
    setWorking(`${action}-${enrollment.id}`);
    try {
      if (action === 'pause') await pauseEnrollment(workflowId, enrollment.id, organizationId);
      else if (action === 'resume') await resumeEnrollment(workflowId, enrollment.id, organizationId);
      else if (action === 'retry') await retryEnrollment(workflowId, enrollment.id, organizationId);
      else await cancelEnrollment(workflowId, enrollment.id, organizationId);
      await loadEnrollments(page);
      const pastTense = { pause: 'paused', resume: 'resumed', retry: 'retried', cancel: 'cancelled' }[action];
      toast({ title: 'Updated', description: `Run ${pastTense} successfully` });
    } catch (error) {
      toast({ title: 'Error', description: errorMessage(error, `Failed to ${action} run`), variant: 'destructive' });
    } finally {
      setWorking(null);
    }
  };

  const cancelSelectedEnrollment = async () => {
    if (!enrollmentToCancel) return;
    const target = enrollmentToCancel;
    setEnrollmentToCancel(null);
    await changeState(target, 'cancel');
  };

  const changePage = async (nextPage: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadEnrollments(nextPage);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load automation runs'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Automation runs</DialogTitle>
          <DialogDescription>Enroll a contact and monitor workflow activity.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="workflow-contact-search">Find contact</Label>
            <div className="flex gap-2">
              <Input id="workflow-contact-search" value={search} onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void searchContacts(); }
                }} placeholder="Name or email" />
              <Button type="button" variant="outline" onClick={() => void searchContacts()} disabled={loading}>Search</Button>
            </div>
            <Label htmlFor="workflow-contact">Contact</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
              <SelectTrigger id="workflow-contact" aria-label="Contact" className="h-11">
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={String(contact.id)}>
                    {contactName(contact)}{contact.email ? ` — ${contact.email}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="self-end" onClick={() => void enroll()} disabled={!selectedContactId || working !== null}>
            <UserPlus className="mr-2 h-4 w-4" />
            {working === 'enroll' ? 'Enrolling…' : 'Enroll'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-sm font-medium">Run history</p>
            <p className="text-xs text-muted-foreground">{pagination.total} total</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadData(search)} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {loadError && (
            <ErrorState
              kind="inline"
              title="Unable to load automation runs"
              description={loadError}
              onAction={() => void loadData(search)}
            />
          )}
          {!loading && !loadError && enrollments.length === 0 && (
            <EmptyState icon={UserPlus} kind="inline" title="No runs yet" />
          )}
          {enrollments.map((enrollment) => {
            const busy = working?.endsWith(`-${enrollment.id}`) ?? false;
            const statusVisual = getWorkflowEnrollmentStatusVisual(enrollment.status);
            const started = formatDateTime(enrollment.enrolled_at);
            const nextAction = formatDateTime(enrollment.next_action_at);
            const completed = formatDateTime(enrollment.completed_at);
            return (
              <div key={enrollment.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{contactName(enrollment)}</p>
                    <Badge className={cn('shrink-0', statusVisual.badgeClass)}>{statusVisual.label}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{enrollment.email || `Contact #${enrollment.contact_id}`}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Step {enrollment.current_step}
                    {started ? ` · Started ${started}` : ''}
                    {nextAction ? ` · Next ${nextAction}` : ''}
                    {completed ? ` · Finished ${completed}` : ''}
                  </p>
                  {enrollment.error_message && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{enrollment.error_message}</p>
                  )}
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
                      onClick={() => setEnrollmentToCancel(enrollment)}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={loading || pagination.page <= 1}
                onClick={() => void changePage(pagination.page - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading || pagination.page >= pagination.totalPages}
                onClick={() => void changePage(pagination.page + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={Boolean(enrollmentToCancel)} onOpenChange={(nextOpen) => !nextOpen && setEnrollmentToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
            <AlertDialogDescription>
              {enrollmentToCancel
                ? `${contactName(enrollmentToCancel)} will stop at the current step. This run cannot be resumed.`
                : 'This automation run will stop and cannot be resumed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground interaction-button--destructive"
              onClick={() => void cancelSelectedEnrollment()}>
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
