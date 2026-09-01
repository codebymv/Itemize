import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import {
  cancelEnrollment, enrollContact, getWorkflowEnrollments, pauseEnrollment, resumeEnrollment,
  retryEnrollment, type WorkflowEnrollment,
} from '@/services/automationsApi';
import { getContacts } from '@/services/contactsApi';
import type { Contact } from '@/types';
import { cn } from '@/lib/utils';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { workflowQueryKeys } from '@/services/workflowQueryKeys';
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
  const queryClient = useQueryClient();
  const [selectedContactId, setSelectedContactId] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const { pending, run, dismissIfIdle } = useSingleFlightAction();
  const [page, setPage] = useState(1);
  const [enrollmentToCancel, setEnrollmentToCancel] = useState<WorkflowEnrollment | null>(null);

  const contactsQuery = useQuery({
    queryKey: ['workflow-enrollment-contacts', organizationId, submittedSearch],
    queryFn: ({ signal }) => getContacts({
      organization_id: organizationId,
      status: 'active',
      search: submittedSearch || undefined,
      sort_by: 'first_name',
      sort_order: 'asc',
      page: 1,
      limit: 25,
    }, organizationId, signal),
    enabled: open,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const enrollmentsQuery = useQuery({
    queryKey: workflowQueryKeys.enrollmentPage(organizationId, workflowId, page, 50),
    queryFn: ({ signal }) => getWorkflowEnrollments(
      workflowId,
      organizationId,
      { page, limit: 50 },
      signal,
    ),
    enabled: open,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
    placeholderData: keepPreviousData,
  });
  const contacts = contactsQuery.data?.contacts ?? [];
  const enrollments = enrollmentsQuery.data?.enrollments ?? [];
  const pagination = enrollmentsQuery.data?.pagination ?? { page, limit: 50, total: 0, totalPages: 1 };
  const loading = contactsQuery.isPending || enrollmentsQuery.isPending;
  const refreshing = contactsQuery.isFetching || enrollmentsQuery.isFetching;
  const loadError = enrollmentsQuery.error
    ? errorMessage(enrollmentsQuery.error, 'Failed to load automation runs')
    : contactsQuery.error
      ? errorMessage(contactsQuery.error, 'Failed to load contacts')
      : null;

  useEffect(() => {
    setPage(1);
    setSelectedContactId('');
  }, [organizationId, workflowId]);

  useEffect(() => {
    if (!enrollmentsQuery.data) return;
    const lastAvailablePage = Math.max(1, enrollmentsQuery.data.pagination.totalPages);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [enrollmentsQuery.data, page]);

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.enrollments(organizationId, workflowId) }),
      queryClient.invalidateQueries({ queryKey: ['workflow-enrollment-contacts', organizationId] }),
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.queues(organizationId) }),
    ]);
  };

  const searchContacts = async () => {
    const nextSearch = search.trim();
    if (nextSearch === submittedSearch) await contactsQuery.refetch();
    else setSubmittedSearch(nextSearch);
  };

  const runWorkflowAction = async (actionKey: string, action: () => Promise<void>) => {
    await run(async () => {
      setActiveAction(actionKey);
      try {
        await action();
      } finally {
        setActiveAction(null);
      }
    });
  };

  const enroll = async () => {
    const contactId = Number(selectedContactId);
    if (!Number.isInteger(contactId) || contactId < 1) return;
    await runWorkflowAction('enroll', async () => {
      try {
        await enrollContact(workflowId, contactId, organizationId, { source: 'manual' });
        setSelectedContactId('');
        setPage(1);
        await refreshData();
        toast({ title: 'Enrolled', description: 'Contact enrolled successfully' });
      } catch (error) {
        toast({ title: 'Error', description: errorMessage(error, 'Failed to enroll contact'), variant: 'destructive' });
      }
    });
  };

  const changeState = async (enrollment: WorkflowEnrollment, action: 'pause' | 'resume' | 'retry' | 'cancel') => {
    await runWorkflowAction(`${action}-${enrollment.id}`, async () => {
      try {
        if (action === 'pause') await pauseEnrollment(workflowId, enrollment.id, organizationId);
        else if (action === 'resume') await resumeEnrollment(workflowId, enrollment.id, organizationId);
        else if (action === 'retry') await retryEnrollment(workflowId, enrollment.id, organizationId);
        else await cancelEnrollment(workflowId, enrollment.id, organizationId);
        await refreshData();
        const pastTense = { pause: 'paused', resume: 'resumed', retry: 'retried', cancel: 'cancelled' }[action];
        toast({ title: 'Updated', description: `Run ${pastTense} successfully` });
      } catch (error) {
        toast({ title: 'Error', description: errorMessage(error, `Failed to ${action} run`), variant: 'destructive' });
      }
    });
  };

  const cancelSelectedEnrollment = async () => {
    if (!enrollmentToCancel) return;
    const target = enrollmentToCancel;
    await changeState(target, 'cancel');
    setEnrollmentToCancel(null);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) onOpenChange(true);
      else dismissIfIdle(() => onOpenChange(false));
    }}>
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
              <Button type="button" variant="outline" onClick={() => void searchContacts()} disabled={contactsQuery.isFetching}>Search</Button>
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
          <Button className="self-end" onClick={() => void enroll()} disabled={!selectedContactId || pending} aria-busy={activeAction === 'enroll' || undefined}>
            <UserPlus className="mr-2 h-4 w-4" />
            {activeAction === 'enroll' ? 'Enrolling…' : 'Enroll'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-sm font-medium">Run history</p>
            <p className="text-xs text-muted-foreground">{pagination.total} total</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refreshData()} disabled={refreshing}>
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} /> Refresh
          </Button>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {loadError && (
            <ErrorState
              kind="inline"
              title="Unable to load automation runs"
              description={loadError}
              onAction={() => void refreshData()}
            />
          )}
          {!loading && !loadError && enrollments.length === 0 && (
            <EmptyState icon={UserPlus} kind="inline" title="No runs yet" />
          )}
          {enrollments.map((enrollment) => {
            const busy = activeAction?.endsWith(`-${enrollment.id}`) ?? false;
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
                    <Button size="sm" variant="outline" disabled={pending} aria-busy={busy || undefined} onClick={() => void changeState(enrollment, 'pause')}>
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                    </Button>
                  )}
                  {enrollment.status === 'paused' && (
                    <Button size="sm" variant="outline" disabled={pending} aria-busy={busy || undefined} onClick={() => void changeState(enrollment, 'resume')}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Resume
                    </Button>
                  )}
                  {enrollment.status === 'failed' && (
                    <Button size="sm" variant="outline" disabled={pending} aria-busy={busy || undefined} onClick={() => void changeState(enrollment, 'retry')}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
                    </Button>
                  )}
                  {!['completed', 'cancelled'].includes(enrollment.status) && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending}
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
              <Button type="button" variant="outline" size="sm" disabled={enrollmentsQuery.isFetching || pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={enrollmentsQuery.isFetching || pagination.page >= pagination.totalPages}
                onClick={() => setPage(pagination.page + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={Boolean(enrollmentToCancel)} onOpenChange={(nextOpen) => {
        if (!nextOpen) dismissIfIdle(() => setEnrollmentToCancel(null));
      }}>
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
            <AlertDialogCancel disabled={pending}>Keep running</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground interaction-button--destructive"
              disabled={pending}
              aria-busy={activeAction?.startsWith('cancel-') || undefined}
              onClick={() => void cancelSelectedEnrollment()}>
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
