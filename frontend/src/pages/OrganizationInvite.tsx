import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Loader2, Mail, Users } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthState } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/organization-context';
import { useSubscriptionFeatures } from '@/contexts/SubscriptionContext';
import {
  acceptOrganizationInvitationViaGraphql,
  getOrganizationInvitationPreviewViaGraphql,
} from '@/services/organizationsGraphql';
import type { OrganizationInvitationPreview } from '@/types';

export default function OrganizationInvite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuthState();
  const { refresh: refreshOrganizations } = useOrganizationContext();
  const { refreshSubscription } = useSubscriptionFeatures();
  const [preview, setPreview] = useState<OrganizationInvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOrganizationInvitationPreviewViaGraphql(token)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'This invitation is unavailable.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await acceptOrganizationInvitationViaGraphql(token);
      await refreshOrganizations();
      await refreshSubscription();
      setAccepted(true);
      setTimeout(() => navigate('/organization-settings', { replace: true }), 1200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not accept this invitation.');
    } finally {
      setAccepting(false);
    }
  };

  const redirect = `/invite/${token}`;
  const registerUrl = preview
    ? `/register?invitation=${encodeURIComponent(token)}&email=${encodeURIComponent(preview.email)}`
    : '/register';
  const loginUrl = `/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <BackgroundClouds className="opacity-[0.15] dark:opacity-10" cloudCount={8} />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
            {accepted ? <CheckCircle className="h-6 w-6" /> : <Users className="h-6 w-6" />}
          </div>
          <CardTitle>{accepted ? 'Invitation accepted' : 'Join an Itemize workspace'}</CardTitle>
          <CardDescription>
            {preview
              ? `${preview.invited_by_name || 'A teammate'} invited you to ${preview.organization_name}.`
              : 'Checking your secure invitation…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(loading || authLoading) && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          {preview && !accepted && !loading && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">{preview.organization_name}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {preview.email}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Role: {preview.role.charAt(0).toUpperCase() + preview.role.slice(1)}
                </p>
              </div>
              {preview.status === 'expired' ? (
                <p className="text-sm text-destructive">
                  This invitation has expired. Ask the workspace owner to resend it.
                </p>
              ) : currentUser ? (
                <Button className="w-full" onClick={() => void accept()} disabled={accepting}>
                  {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept invitation
                </Button>
              ) : (
                <div className="grid gap-2">
                  <Button asChild><Link to={registerUrl}>Create account and join</Link></Button>
                  <Button asChild variant="outline"><Link to={loginUrl}>Sign in and join</Link></Button>
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
