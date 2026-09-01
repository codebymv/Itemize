import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  type AccountDeletionPreflight,
  deleteViewerAccountViaGraphql,
  getViewerAccountDeletionPreflightViaGraphql,
} from '@/services/authGraphql';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

const blockerMessage = (
  blocker: AccountDeletionPreflight['blockers'][number],
): string => {
  if (blocker.reason === 'OWNERSHIP_TRANSFER_REQUIRED') {
    return `Transfer ownership of ${blocker.organizationName} to another member.`;
  }
  if (blocker.reason === 'ACTIVE_SUBSCRIPTION') {
    return `Cancel the active subscription for ${blocker.organizationName}.`;
  }
  return `${blocker.organizationName} contains signing evidence that requires support-assisted retention.`;
};

export function AccountDeletionAction() {
  const navigate = useNavigate();
  const { currentUser } = useAuthState();
  const { logout } = useAuthActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [preflight, setPreflight] = useState<AccountDeletionPreflight | null>(null);
  const [checking, setChecking] = useState(false);
  const { pending: deleting, run, dismissIfIdle } = useSingleFlightAction();

  const email = currentUser?.email ?? '';
  const needsPassword = currentUser?.provider !== 'google';
  const confirmed = confirmation.trim().toLowerCase() === email.toLowerCase();
  const canDelete =
    preflight?.eligible === true &&
    confirmed &&
    (!needsPassword || currentPassword.length > 0);

  const reset = () => {
    setConfirmation('');
    setCurrentPassword('');
    setPreflight(null);
  };

  const loadPreflight = async () => {
    setChecking(true);
    try {
      setPreflight(await getViewerAccountDeletionPreflightViaGraphql());
    } catch (error) {
      toast({
        title: 'Could not check deletion requirements',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
      setOpen(false);
    } finally {
      setChecking(false);
    }
  };

  const deleteAccount = async () => {
    if (!canDelete) return;
    await run(async () => {
      try {
        const result = await deleteViewerAccountViaGraphql(
          confirmation,
          needsPassword ? currentPassword : undefined,
        );
        logout();
        toast({
          title: 'Account deletion scheduled',
          description: `Your account is locked until deletion on ${new Date(result.scheduledAt).toLocaleDateString()}. Check your email if you want to recover it.`,
        });
        navigate('/', { replace: true });
      } catch (error) {
        toast({
          title: 'Could not schedule account deletion',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
        await loadPreflight();
      }
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="account-deletion-title">
      <div className="space-y-1.5">
        <h3 id="account-deletion-title" className="text-sm font-medium">Delete account</h3>
        <p className="text-sm text-muted-foreground">
          Delete your account after a seven-day recovery window.
        </p>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setOpen(true);
            void loadPreflight();
          } else {
            dismissIfIdle(() => {
              setOpen(false);
              reset();
            });
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete my account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Schedule permanent account deletion?</AlertDialogTitle>
              <AlertDialogDescription>
                Itemize will lock the account immediately and send a one-use recovery link.
                Permanent deletion occurs after the seven-day recovery window.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {checking ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking organizations and retention requirements...
              </div>
            ) : preflight && !preflight.eligible ? (
              <div className="space-y-4 py-2">
                <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Resolve these items first</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {preflight.blockers.map((blocker) => (
                        <li key={`${blocker.reason}-${blocker.organizationId}`}>
                          {blockerMessage(blocker)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  No account or organization data has been changed.
                </p>
              </div>
            ) : preflight ? (
              <div className="space-y-4 py-2">
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">What happens next</p>
                  <p className="mt-1 text-muted-foreground">
                    You will leave {preflight.membershipCount}{' '}
                    {preflight.membershipCount === 1 ? 'organization' : 'organizations'} and
                    permanently delete {preflight.ownedOrganizationCount}{' '}
                    {preflight.ownedOrganizationCount === 1
                      ? 'owned organization'
                      : 'owned organizations'} after {preflight.recoveryDays} days.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-deletion-confirmation">
                    Type {email} to confirm
                  </Label>
                  <Input
                    id="account-deletion-confirmation"
                    type="email"
                    autoComplete="off"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    disabled={deleting}
                  />
                </div>
                {needsPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="account-deletion-password">Current password</Label>
                    <Input
                      id="account-deletion-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      disabled={deleting}
                    />
                  </div>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">Retention disclosures</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {preflight.retentionNotices.map((notice) => (
                      <li key={notice}>{notice}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel>
              {preflight && !preflight.eligible ? (
                <Button onClick={() => navigate('/organization-settings')}>
                  Review organization settings
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => void deleteAccount()}
                  disabled={!canDelete || deleting || checking}
                  aria-busy={deleting || undefined}
                >
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {deleting ? 'Scheduling deletion...' : 'Schedule account deletion'}
                </Button>
              )}
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
