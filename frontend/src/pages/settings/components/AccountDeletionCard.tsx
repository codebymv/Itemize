import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { deleteViewerAccountViaGraphql } from '@/services/authGraphql';

export function AccountDeletionCard() {
  const navigate = useNavigate();
  const { currentUser } = useAuthState();
  const { logout } = useAuthActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const email = currentUser?.email ?? '';
  const needsPassword = currentUser?.provider !== 'google';
  const confirmed = confirmation.trim().toLowerCase() === email.toLowerCase();
  const canDelete = confirmed && (!needsPassword || currentPassword.length > 0);

  const reset = () => {
    setConfirmation('');
    setCurrentPassword('');
  };

  const deleteAccount = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await deleteViewerAccountViaGraphql(
        confirmation,
        needsPassword ? currentPassword : undefined,
      );
      logout();
      toast({
        title: 'Account deleted',
        description: 'Your Itemize account and eligible personal workspaces were deleted.',
      });
      navigate('/', { replace: true });
    } catch (error) {
      toast({
        title: 'Could not delete account',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <SettingsSectionTitle icon={Trash2}>Delete account</SettingsSectionTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Permanently delete your account and eligible personal workspaces. This cannot
            be undone, so download an export first if you want to keep your data.
          </p>
          <p>
            You must first cancel active subscriptions and transfer any workspace that has
            other members. Signed-document evidence may require help from support.
          </p>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (deleting) return;
            setOpen(nextOpen);
            if (!nextOpen) reset();
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete my account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your account and eligible personal workspaces.
                It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
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
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={() => void deleteAccount()}
                disabled={!canDelete || deleting}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {deleting ? 'Deleting account...' : 'Permanently delete account'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
